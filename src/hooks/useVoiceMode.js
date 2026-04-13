import { useState, useRef, useCallback, useEffect } from 'react';

const SILENCE_THRESHOLD = 10;    // average byte frequency below this = silence
const SILENCE_DURATION = 1500;   // ms of continuous silence before auto-stop
const MIN_RECORDING_TIME = 2000; // ms — don't auto-stop before this (gives user time to start speaking)

export function useVoiceMode({ onTranscript, onAutoSubmit, onSpeakEnd }) {
  const [voiceModeOn, setVoiceModeOn] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micPermission, setMicPermission] = useState(null);
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const silenceContextRef = useRef(null);
  const isListeningRef = useRef(false);
  const chunksRef = useRef([]);
  const speakCancelledRef = useRef(false);

  // Keep ref in sync with state for rAF loop
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const clearError = useCallback((delay = 3000) => {
    setTimeout(() => setError(null), delay);
  }, []);

  // iOS audio unlock — play a silent buffer to allow subsequent audio.play()
  const unlockAudio = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      audioContextRef.current = ctx;
    } catch {
      // AudioContext not available — TTS may not work on this browser
    }
  }, []);

  const interruptSpeaking = useCallback(() => {
    speakCancelledRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    isListeningRef.current = false;
    recorder.stop();

    // Clean up silence detection audio context
    if (silenceContextRef.current) {
      silenceContextRef.current.close().catch(() => {});
      silenceContextRef.current = null;
    }
  }, []);

  const toggleVoiceMode = useCallback(() => {
    setVoiceModeOn((prev) => {
      if (prev) {
        // Turning off — clean up
        interruptSpeaking();
        stopListening();
      } else {
        // Turning on — unlock audio for iOS
        unlockAudio();
        // Check mic permission
        if (navigator.permissions?.query) {
          navigator.permissions.query({ name: 'microphone' }).then((result) => {
            setMicPermission(result.state);
          }).catch(() => {
            setMicPermission('prompt');
          });
        } else {
          setMicPermission('prompt');
        }
      }
      return !prev;
    });
  }, [interruptSpeaking, stopListening, unlockAudio]);

  const speakText = useCallback(async (text) => {
    if (!voiceModeOn) return;

    interruptSpeaking();
    speakCancelledRef.current = false; // reset after our own interrupt

    try {
      const res = await fetch('/.netlify/functions/voice-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      // Check if interrupted during fetch
      if (speakCancelledRef.current) return;

      if (!res.ok) return;

      const { audioBase64 } = await res.json();
      if (!audioBase64 || speakCancelledRef.current) return;

      const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`);
      audioRef.current = audio;
      setIsSpeaking(true);

      audio.onended = () => {
        setIsSpeaking(false);
        audioRef.current = null;
        onSpeakEnd?.();
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        audioRef.current = null;
      };

      await audio.play().catch(() => {
        setIsSpeaking(false);
        audioRef.current = null;
      });
    } catch {
      // TTS failure is non-critical
    }
  }, [voiceModeOn, interruptSpeaking]);

  const startListening = useCallback(async () => {
    // Interrupt TTS if playing (F6)
    if (isSpeaking) {
      interruptSpeaking();
    }

    setError(null);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      setError('Microphone access denied. Allow microphone in your browser settings.');
      setMicPermission('denied');
      return;
    }

    setMicPermission('granted');
    mediaStreamRef.current = stream;
    chunksRef.current = [];

    // Select MIME type
    let mimeType;
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      // Release mic hardware
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsListening(false);

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      chunksRef.current = [];

      if (blob.size === 0) {
        setError("Didn't catch that. Try again.");
        clearError();
        return;
      }

      try {
        const res = await fetch('/.netlify/functions/voice-stt', {
          method: 'POST',
          headers: { 'Content-Type': recorder.mimeType },
          body: blob,
        });

        if (!res.ok) {
          setError('Voice transcription failed. Try typing instead.');
          clearError();
          return;
        }

        const { transcript } = await res.json();

        if (!transcript) {
          setError("Didn't catch that. Try again.");
          clearError();
          return;
        }

        onTranscript(transcript);
        setTimeout(() => onAutoSubmit(), 0);
      } catch {
        setError('Voice transcription failed. Try typing instead.');
        clearError();
      }
    };

    recorder.start();
    isListeningRef.current = true;
    setIsListening(true);

    // Silence detection via Web Audio API AnalyserNode
    try {
      const silenceCtx = new (window.AudioContext || window.webkitAudioContext)();
      silenceContextRef.current = silenceCtx;
      const source = silenceCtx.createMediaStreamSource(stream);
      const analyser = silenceCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = null;
      const recordingStart = Date.now();

      const checkSilence = () => {
        if (!isListeningRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (average < SILENCE_THRESHOLD) {
          if (!silenceStart) silenceStart = Date.now();
          if (
            Date.now() - silenceStart > SILENCE_DURATION &&
            Date.now() - recordingStart > MIN_RECORDING_TIME
          ) {
            stopListening();
            return;
          }
        } else {
          silenceStart = null;
        }

        requestAnimationFrame(checkSilence);
      };

      requestAnimationFrame(checkSilence);
    } catch {
      // Silence detection unavailable — user can still tap to stop manually
    }
  }, [isSpeaking, interruptSpeaking, onTranscript, onAutoSubmit, stopListening, clearError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop();
      audioRef.current?.pause();
      audioContextRef.current?.close().catch(() => {});
      silenceContextRef.current?.close().catch(() => {});
    };
  }, []);

  return {
    voiceModeOn,
    isListening,
    isSpeaking,
    toggleVoiceMode,
    startListening,
    stopListening,
    speakText,
    interruptSpeaking,
    micPermission,
    error,
  };
}
