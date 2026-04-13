import { useState, useRef, useCallback, useEffect } from 'react';

const SILENCE_THRESHOLD = 10;    // average byte frequency below this = silence
const SILENCE_DURATION = 1500;   // ms of continuous silence before auto-stop
const MIN_RECORDING_TIME = 2000; // ms — don't auto-stop before this (gives user time to start speaking)

export function useVoiceMode({ onTranscript }) {
  const [voiceModeOn, setVoiceModeOn] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micPermission, setMicPermission] = useState(null);
  const [error, setError] = useState(null);
  const [debugLog, setDebugLog] = useState([]);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const unlockedAudioRef = useRef(null); // reusable Audio element unlocked by user gesture
  const silenceContextRef = useRef(null);
  const isListeningRef = useRef(false);
  const chunksRef = useRef([]);
  const speakCancelledRef = useRef(false);
  const autoListenTimerRef = useRef(null);
  const isAutoListenRef = useRef(false); // true when recording was auto-started (not user-tapped)

  // Keep ref in sync with state for rAF loop
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const debug = useCallback((msg) => {
    setDebugLog((prev) => [...prev.slice(-19), `${new Date().toLocaleTimeString()}: ${msg}`]);
  }, []);

  const clearError = useCallback((delay = 3000) => {
    setTimeout(() => setError(null), delay);
  }, []);

  // iOS audio unlock — must happen inside a user gesture (the toggle tap)
  // Unlock both AudioContext (for silence detection) and HTMLAudioElement (for TTS playback)
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
      // AudioContext not available
    }

    // Create and play a silent Audio element to unlock HTMLAudioElement.play() on iOS
    // This same element is reused for all TTS playback
    try {
      const audio = new Audio();
      // Tiny silent MP3 (1 frame)
      audio.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwAAAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwAAAAAAAAAAAAAAAAAAAAA=';
      audio.volume = 0.01;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        unlockedAudioRef.current = audio;
        debug('audio unlock: OK');
      }).catch((err) => {
        unlockedAudioRef.current = audio;
        debug(`audio unlock: FAILED - ${err.message}`);
      });
    } catch {
      // Audio element not available
    }
  }, []);

  const interruptSpeaking = useCallback(() => {
    speakCancelledRef.current = true;
    // Cancel any pending auto-listen timer
    if (autoListenTimerRef.current) {
      clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      // Don't null audioRef if it's the shared unlocked element
      audioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const stopListening = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;

    isListeningRef.current = false;
    recorder.stop();

    if (silenceContextRef.current) {
      silenceContextRef.current.close().catch(() => {});
      silenceContextRef.current = null;
    }
  }, []);

  const toggleVoiceMode = useCallback(() => {
    setVoiceModeOn((prev) => {
      if (prev) {
        interruptSpeaking();
        stopListening();
      } else {
        unlockAudio();
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

  const startListening = useCallback(async (options = {}) => {
    const { auto = false } = options;
    isAutoListenRef.current = auto;

    // If already listening, don't start again
    if (isListeningRef.current) return;

    // If TTS is playing, interrupt it first (tap-to-interrupt)
    if (audioRef.current) {
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
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsListening(false);

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      chunksRef.current = [];

      const wasAuto = isAutoListenRef.current;

      if (blob.size === 0) {
        if (wasAuto) {
          // Auto-listen got silence — quietly restart
          debug('auto-listen: silence, restarting...');
          autoListenTimerRef.current = setTimeout(() => {
            autoListenTimerRef.current = null;
            startListeningRef.current?.({ auto: true });
          }, 1000);
          return;
        }
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
        debug(`STT result: "${transcript || '(empty)'}"`);

        if (!transcript) {
          if (wasAuto) {
            // Auto-listen got empty transcript — quietly restart
            debug('auto-listen: empty transcript, restarting...');
            autoListenTimerRef.current = setTimeout(() => {
              autoListenTimerRef.current = null;
              startListeningRef.current?.({ auto: true });
            }, 1000);
            return;
          }
          setError("Didn't catch that. Try again.");
          clearError();
          return;
        }

        onTranscript(transcript);
      } catch {
        setError('Voice transcription failed. Try typing instead.');
        clearError();
      }
    };

    recorder.start();
    isListeningRef.current = true;
    setIsListening(true);
    debug(`startListening: recording (mime=${recorder.mimeType})`);

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
  }, [interruptSpeaking, onTranscript, stopListening, clearError]);

  // Ref so speakText's onended can call startListening without stale closure
  const startListeningRef = useRef(null);
  startListeningRef.current = startListening;

  const speakText = useCallback(async (text) => {
    debug(`speakText called, voiceModeOn=${voiceModeOn}`);
    if (!voiceModeOn) { debug('speakText: skipped (voice off)'); return; }

    interruptSpeaking();
    speakCancelledRef.current = false;

    try {
      debug('speakText: fetching TTS...');
      const res = await fetch('/.netlify/functions/voice-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (speakCancelledRef.current) { debug('speakText: cancelled during fetch'); return; }
      if (!res.ok) { debug(`speakText: TTS error ${res.status}`); return; }

      const { audioBase64 } = await res.json();
      if (!audioBase64 || speakCancelledRef.current) { debug('speakText: no audio or cancelled'); return; }

      debug(`speakText: got audio (${audioBase64.length} chars), unlocked=${!!unlockedAudioRef.current}`);

      // Reuse the unlocked Audio element on iOS, or create new one
      const audio = unlockedAudioRef.current || new Audio();
      audio.src = `data:audio/mp3;base64,${audioBase64}`;
      audioRef.current = audio;
      setIsSpeaking(true);

      audio.onended = () => {
        debug('speakText: audio ended');
        setIsSpeaking(false);
        audioRef.current = null;
        autoListenTimerRef.current = setTimeout(() => {
          autoListenTimerRef.current = null;
          debug('speakText: auto-starting listen after TTS');
          startListeningRef.current?.({ auto: true });
        }, 1000);
      };

      audio.onerror = (e) => {
        debug(`speakText: audio ERROR - ${e.type}`);
        setIsSpeaking(false);
        audioRef.current = null;
      };

      await audio.play().then(() => {
        debug('speakText: play() started OK');
      }).catch((err) => {
        debug(`speakText: play() FAILED - ${err.message}`);
        setIsSpeaking(false);
        audioRef.current = null;
      });
    } catch (err) {
      debug(`speakText: exception - ${err.message}`);
    }
  }, [voiceModeOn, interruptSpeaking, debug]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current?.state === 'recording' && mediaRecorderRef.current.stop();
      audioRef.current?.pause();
      audioContextRef.current?.close().catch(() => {});
      silenceContextRef.current?.close().catch(() => {});
      if (autoListenTimerRef.current) clearTimeout(autoListenTimerRef.current);
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
    debugLog,
  };
}
