# Voice + Video Audio Interference

**Status:** Research Complete
**Date:** 2026-04-16
**Purpose:** When a YouTube video is playing on the same device as the voice assistant, the mic picks up the video's audio and pollutes the STT input. Is there a browser-based solution that preserves hands-free operation, and how do production systems handle this?

---

## TL;DR

- **Problem:** The mic cannot distinguish between the user's voice and video audio playing through the device speaker — the same root cause as the TTS interrupt problem already solved in `useVoiceMode.js`
- **Browser AEC limitation:** `echoCancellation: true` in `getUserMedia` works for mic feedback loops but is unreliable against arbitrary audio output (YouTube video, TTS). No browser API provides a clean reference-signal subtraction that works across all audio sources reliably
- **No production browser system has solved this fully.** Home Assistant relies on browser AEC and accepts degraded accuracy. Rhasspy users report background video audio "completely prevents accurate speech recognition" with no documented fix
- **Most viable hands-free mitigation:** Two-tier RMS gating — monitor output audio level and raise the silence detection threshold dynamically while video is loud. The user's voice spikes above the elevated threshold; the video audio stays below it. Falls back to auto-pause if the video is too loud
- **Hardware beamforming** (how Alexa/Google Home solve this) is not available in a browser — requires a physical microphone array, not applicable to a web app

---

## Sequence Diagram

How audio interference occurs and where it enters the pipeline:

```
CURRENT FLOW — interference path
──────────────────────────────────────────────────────────────────────
┌──────────┐   ┌─────────────────────┐   ┌────────────┐   ┌────────┐
│  User    │   │  Device Speaker     │   │  Browser   │   │ Google │
│          │   │                     │   │  Mic       │   │ Cloud  │
│          │   │                     │   │  (capture) │   │  STT   │
└────┬─────┘   └──────────┬──────────┘   └─────┬──────┘   └───┬────┘
     │                    │                    │               │
     │  Starts voice mode │                    │               │
     ├──────────────────────────────────────▶ │               │
     │                    │                    │ recording     │
     │                    │ YouTube video      │               │
     │                    │ audio playing      │               │
     │                    ├───────────────────▶│               │
     │                    │         ▲          │               │
     │  User speaks       │         │          │               │
     ├──────────────────────────────┤          │               │
     │                    │  BOTH signals      │               │
     │                    │  captured together │               │
     │                    │                    │  audio blob   │
     │                    │                    │  (user voice  │
     │                    │                    │  + video mix) │
     │                    │                    ├──────────────▶│
     │                    │                    │               │ STT
     │                    │                    │               │ confused
     │                    │                    │  bad/partial  │ by mix
     │                    │                    │  transcript   │
     │◀───────────────────────────────────────────────────────┤
```

```
TWO-TIER RMS GATE — mitigation path
──────────────────────────────────────────────────────────────────────
┌──────────┐   ┌─────────────────────┐   ┌────────────────────────┐
│  User    │   │  useVoiceMode.js    │   │  Silence Detection     │
│          │   │  AnalyserNode       │   │  (existing rAF loop)   │
└────┬─────┘   └──────────┬──────────┘   └───────────┬────────────┘
     │                    │                           │
     │                    │  Monitor output RMS        │
     │                    │  (YouTube player audio)    │
     │                    ├──────────────────────────▶│
     │                    │                           │ video loud?
     │                    │                           │ raise threshold
     │                    │                           │ (e.g. 10 → 40)
     │                    │                           │
     │  User speaks loudly│                           │
     ├───────────────────▶│                           │
     │                    │  mic RMS spikes above     │
     │                    │  elevated threshold       │
     │                    ├──────────────────────────▶│
     │                    │                           │ speech detected
     │                    │                           │ → stop recording
     │                    │                           │ → send to STT
     │                    │                           │
     │                    │  video audio alone:       │
     │                    │  RMS stays below          │
     │                    │  elevated threshold       │
     │                    │  → not registered as      │
     │                    │    speech, ignored        │
```

---

## Architecture Diagram

Where each mitigation approach sits in the existing stack:

```
                    ┌─────────────────────────────────┐
                    │         RecipePage.jsx           │
                    │                                  │
                    │  ┌────────────┐  ┌────────────┐  │
                    │  │ YouTube    │  │ useVoice   │  │
                    │  │ IFrame     │  │ Mode.js    │  │
                    │  │ Player     │  │            │  │
                    │  └─────┬──────┘  └─────┬──────┘  │
                    │        │               │          │
                    └────────┼───────────────┼──────────┘
                             │               │
               audio out     │               │  mic in
               (speaker)     │               │  (getUserMedia)
                             ▼               ▼
                    ┌────────────────────────────────┐
                    │         Device Hardware         │
                    │   Speaker ──acoustic──▶ Mic     │
                    │         (interference path)     │
                    └────────────────────────────────┘

MITIGATION OPTIONS — where each one intervenes:

Option 1 — Browser AEC (existing, unreliable)
  getUserMedia({ echoCancellation: true })
  Intervenes: inside browser mic capture pipeline
  Limitation: unreliable for arbitrary audio sources

Option 2 — Two-tier RMS gate (recommended)
  Monitor output AnalyserNode RMS in existing rAF loop
  Intervenes: in silence detection threshold logic
  Limitation: fails if video is louder than user's voice

Option 3 — Auto-pause video on listen start
  player.pauseVideo() in startListening()
  Intervenes: removes the interference source entirely
  Limitation: not hands-free — requires a trigger to start listening

Option 4 — Hardware beamforming
  Multiple physical microphones in an array
  Intervenes: at hardware level, directional suppression
  Limitation: NOT available in browser — requires dedicated hardware
```

---

## Data Flow Diagram — RMS Gate Decision Tree

How the modified silence detection loop would work:

```
rAF loop tick
      │
      ▼
getByteFrequencyData(micArray)
      │
      ▼
micRMS = average(micArray)
      │
      ▼
getByteFrequencyData(outputArray)    ← NEW: monitor output AnalyserNode
      │
      ▼
outputRMS = average(outputArray)
      │
      ▼
  ┌───┴────────────────┐
  │                    │
outputRMS           outputRMS
> VIDEO_THRESHOLD   <= VIDEO_THRESHOLD
  (video loud)        (video quiet / paused)
  │                    │
  ▼                    ▼
threshold =          threshold =
SILENCE_THRESHOLD    SILENCE_THRESHOLD
* GATE_MULTIPLIER    (existing value: 10)
(e.g. 10 * 4 = 40)
  │                    │
  └────────┬───────────┘
           │
           ▼
    micRMS > threshold?
    ┌──────┴──────┐
    │             │
   YES            NO
    │             │
    ▼             ▼
hasSpoken=true   continue waiting
silence timer    (video audio ignored,
resets           stays below gate)
```

---

## Problem vs Solution

| Approach | How it works | Hands-free? | Reliability | Complexity |
|----------|-------------|-------------|-------------|------------|
| `echoCancellation: true` (existing) | Browser subtracts known output signal from mic input | Yes | Low — unreliable for YouTube audio, already proven unreliable for TTS | Zero — already enabled |
| Two-tier RMS gate | Raise silence threshold while output audio is loud; user voice spikes above it | Yes | Medium — fails if video is louder than user | Low — modify existing rAF loop |
| Auto-pause on listen start | `player.pauseVideo()` before `startListening()` | No — requires tap trigger | High — removes interference source entirely | Low — one line |
| Voice mode pauses video for session | Enter voice mode once, video stays paused until mode exits | Partial — one tap to enter mode | High | Low |
| Hardware beamforming | Directional mic array suppresses speaker audio | Yes | High | Not available in browser |
| Demucs neural voice extraction | Server-side ML separates voice from background audio | Yes | High | Very high — server-side GPU, +300–500ms latency |

---

## Real-World Examples

**Home Assistant Voice Satellite** — browser-based, open-source voice control for smart home. Uses `echoCancellation: true` plus optional Chrome AI-based voice isolation. Does NOT auto-pause media during listening. Accepts degraded accuracy as a known limitation when media is playing. Most comparable production system to this app's architecture.
Source: https://github.com/jxlarrea/voice-satellite-card-integration

**Rhasspy** — open-source offline voice assistant, can use browser as remote mic input. Community reports background music and video "completely prevents accurate speech recognition." No documented solution at the application level.
Source: https://community.rhasspy.org/t/recognize-command-with-music/1995

**Sub-500ms latency voice AI (DEV Community)** — developer documented the two-tier RMS gate pattern for preventing a voice agent from hearing its own TTS output. Hard-suppresses mic input while output RMS is above threshold, adds 1.5s cooldown after output stops to allow room resonance to decay. Most directly applicable pattern to this problem.
Source: https://dev.to/remi_etien/i-built-a-voice-ai-with-sub-500ms-latency-heres-the-echo-cancellation-problem-nobody-talks-about-14la

**Alexa / Google Home** — use hardware beamforming (6–8 mic arrays) to directionally suppress speaker audio. Not reproducible in a browser. Mentioned only to explain why these products solve a problem that browser-based apps cannot solve the same way.

---

## Side-by-Side: Existing vs Modified Silence Detection

### Current silence detection (no output monitoring)

```javascript
const SILENCE_THRESHOLD = 10;

const checkSilence = () => {
  if (!isListeningRef.current) return;

  analyser.getByteFrequencyData(dataArray);
  const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

  if (average >= SILENCE_THRESHOLD) {
    hasSpoken = true;
    silenceStart = null;
  } else if (hasSpoken) {
    if (!silenceStart) silenceStart = Date.now();
    if (Date.now() - silenceStart > SILENCE_DURATION) {
      stopListening();
      return;
    }
  }

  requestAnimationFrame(checkSilence);
};
```

### Modified silence detection with two-tier RMS gate

```javascript
const SILENCE_THRESHOLD = 10;
const VIDEO_GATE_MULTIPLIER = 4;   // raise threshold 4x while video is loud
const VIDEO_OUTPUT_THRESHOLD = 15; // output RMS above this = video is audible

// Second AnalyserNode connected to the YouTube player audio output
// (requires Web Audio API routing of the video element)
const outputAnalyser = audioCtx.createAnalyser();
const outputData = new Uint8Array(outputAnalyser.frequencyBinCount);

const checkSilence = () => {
  if (!isListeningRef.current) return;

  // Existing: measure mic input
  analyser.getByteFrequencyData(dataArray);
  const micAverage = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

  // New: measure output (video) level
  outputAnalyser.getByteFrequencyData(outputData);
  const outputAverage = outputData.reduce((a, b) => a + b, 0) / outputData.length;

  // Raise threshold if video audio is audible
  const activeThreshold = outputAverage > VIDEO_OUTPUT_THRESHOLD
    ? SILENCE_THRESHOLD * VIDEO_GATE_MULTIPLIER
    : SILENCE_THRESHOLD;

  if (micAverage >= activeThreshold) {
    hasSpoken = true;
    silenceStart = null;
  } else if (hasSpoken) {
    if (!silenceStart) silenceStart = Date.now();
    if (Date.now() - silenceStart > SILENCE_DURATION) {
      stopListening();
      return;
    }
  }

  requestAnimationFrame(checkSilence);
};
```

**Caveat:** Routing the YouTube IFrame player's audio through a Web Audio API `AnalyserNode` requires capturing the video element's audio stream via `audioCtx.createMediaElementSource(videoElement)`. This is possible once the IFrame is replaced with the YouTube IFrame Player API (Phase A, V1).

---

## Sources

- Home Assistant Voice Satellite integration: https://github.com/jxlarrea/voice-satellite-card-integration
- Rhasspy community — voice + music interference: https://community.rhasspy.org/t/recognize-command-with-music/1995
- Two-tier RMS gate pattern: https://dev.to/remi_etien/i-built-a-voice-ai-with-sub-500ms-latency-heres-the-echo-cancellation-problem-nobody-talks-about-14la
- getUserMedia audio constraints: https://blog.addpipe.com/getusermedia-audio-constraints/
- MDN echoCancellation property: https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSettings/echoCancellation
- Whisper preprocessing discussion: https://github.com/openai/whisper/discussions/2125
- Hacker News — browser audio isolation: https://news.ycombinator.com/item?id=40918152
