# Voice Chat — Implementation

**PRD:** `docs/planning/PRD_voice_chat.md`
**Research:** `docs/research/RE_voice_options_comparison.md`
**Scope:** Voice input (Google Cloud STT) and voice output (Google Cloud TTS) as an I/O layer around the existing text chat. Two new Netlify functions, one custom hook, and RecipePage.jsx integration. No changes to `recipe-chat.js`.

---

## Functional Requirements Covered

| # | Requirement | Status |
|---|-------------|--------|
| F1 | Mic button in the chat input area that starts/stops listening | Done |
| F2 | Visual listening indicator (pulsing ring) while mic is active | Done |
| F3 | Transcript appears in input field after user stops speaking (batch STT) | Done |
| F4 | Auto-submit after transcript is returned (no tap required) | Done |
| F5 | TTS reads every assistant response aloud while voice mode is active | Done |
| F6 | Tap mic to interrupt TTS playback (voice-activated interrupt not feasible — browser echo cancellation is unreliable) | Done |
| F7 | Voice mode toggle button; state persists for the session | Done |

---

## Out of Scope

| # | Requirement | Reason |
|---|-------------|--------|
| OS1 | Streaming STT (live interim transcription) | Netlify Functions have a 10s execution limit — streaming requires a persistent connection |
| OS2 | Voice-activated TTS interrupt (speak to interrupt) | Browser `echoCancellation` is unreliable for filtering local TTS playback — tap-to-interrupt used instead |
| OS3 | Always-on wake word detection | PRD out of scope |
| OS4 | Voice control for non-chat actions (e.g. "pause video") | PRD out of scope — requires LangGraph agent tools (Phase 3) |

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `netlify/functions/voice-stt.js` | Create |
| `netlify/functions/voice-tts.js` | Create |
| `src/hooks/useVoiceMode.js` | Create |
| `src/pages/RecipePage.jsx` | Modify |
| `netlify/functions/__tests__/voice-stt.test.js` | Create |
| `netlify/functions/__tests__/voice-tts.test.js` | Create |

---

## Key Reuse

| Source | What to reuse |
|--------|--------------|
| `netlify/functions/recipe-chat.js` lines 5–9 | CORS headers block — copy verbatim into both new functions |
| `netlify/functions/recipe-chat.js` line 1 | `process.env.GOOGLE_AI_KEY` pattern — same env var, or fallback `GOOGLE_CLOUD_API_KEY \|\| GOOGLE_AI_KEY` if a separate key is needed |
| `netlify/functions/__tests__/recipe-chat.test.js` | `makeEvent` helper, `vi.stubGlobal('fetch')` mock pattern, `process.env.GOOGLE_AI_KEY = 'test-key'` in `beforeEach` |
| `src/hooks/useYouTubeAuth.js` | Custom hook structure: `useState` + `useCallback` + return object with state and callbacks |
| `src/pages/RecipePage.jsx` line 87 | `handleChatSubmit` — voice auto-submit feeds into this existing function via programmatic form submit |

---

## Implementation Checklist

### 1. Enable Google Cloud APIs

The existing `GOOGLE_AI_KEY` is used with `generativelanguage.googleapis.com`. Google Cloud STT (`speech.googleapis.com`) and TTS (`texttospeech.googleapis.com`) are separate APIs and must be enabled on the same Google Cloud project.

- [ ] In Google Cloud Console, find the project that owns `GOOGLE_AI_KEY`
- [ ] Enable **Cloud Speech-to-Text API**
- [ ] Enable **Cloud Text-to-Speech API**
- [ ] Test STT:
  ```
  curl -s -X POST "https://speech.googleapis.com/v1/speech:recognize?key=$GOOGLE_AI_KEY" \
    -H "Content-Type: application/json" \
    -d '{"config":{"encoding":"WEBM_OPUS","sampleRateHertz":48000,"languageCode":"en-US"},"audio":{"content":""}}'
  ```
  Verify: returns JSON response (even empty result), not an `API_NOT_ENABLED` error
- [ ] Test TTS:
  ```
  curl -s "https://texttospeech.googleapis.com/v1/voices?key=$GOOGLE_AI_KEY" | head -c 200
  ```
  Verify: returns JSON with a `voices` array

If the existing key cannot be used (project restrictions, different project):
- [ ] Create a new API key restricted to `speech.googleapis.com` and `texttospeech.googleapis.com`
- [ ] Add as `GOOGLE_CLOUD_API_KEY` in `.env` and Netlify environment variables

---

### 2. Backend — voice-stt.js

Create `netlify/functions/voice-stt.js`.

**Constants:**
```javascript
const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY || process.env.GOOGLE_AI_KEY;
const STT_API_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const MAX_BODY_SIZE = 1_400_000; // ~1MB in base64 ≈ 15s of webm/opus audio
```

- [ ] Add CORS headers block (copy from `recipe-chat.js` lines 5–9)
- [ ] Handle `OPTIONS` preflight → return 200
- [ ] Reject non-`POST` → return 405
- [ ] Guard body size: if `event.body.length > MAX_BODY_SIZE` → return 413 with `"Audio too large. Keep recordings under 15 seconds."`
- [ ] Read audio from `event.body` — Netlify base64-encodes binary bodies when `event.isBase64Encoded` is `true`. If `false`, convert: `Buffer.from(event.body).toString('base64')`
- [ ] Detect encoding from `Content-Type` header:
  - Contains `webm` → `WEBM_OPUS`, `sampleRateHertz: 48000`
  - Contains `mp4` or `m4a` → `ENCODING_UNSPECIFIED`, `sampleRateHertz: 0` (auto-detect, for Safari)
  - Default → `WEBM_OPUS`, `sampleRateHertz: 48000`
- [ ] Build request body:
  ```javascript
  {
    config: {
      encoding,
      sampleRateHertz,
      languageCode: 'en-US',
      model: 'latest_short',
      enableAutomaticPunctuation: true,
    },
    audio: { content: audioBase64 }
  }
  ```
- [ ] POST to `${STT_API_URL}?key=${GOOGLE_API_KEY}` with `Content-Type: application/json`
- [ ] Handle non-200 from Google → return 500 with `"STT error: <status>"`
- [ ] Extract transcript: `result.results?.[0]?.alternatives?.[0]?.transcript || ''`
- [ ] Extract confidence: `result.results?.[0]?.alternatives?.[0]?.confidence || 0`
- [ ] Return `{ statusCode: 200, body: JSON.stringify({ transcript, confidence }) }` — empty transcript is valid (silence), not an error
- [ ] Test: POST with audio blob → verify transcript returned

---

### 3. Backend — voice-tts.js

Create `netlify/functions/voice-tts.js`.

**Constants:**
```javascript
const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY || process.env.GOOGLE_AI_KEY;
const TTS_API_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const MAX_TEXT_LENGTH = 5000;
```

- [ ] Add CORS headers block (copy from `recipe-chat.js` lines 5–9)
- [ ] Handle `OPTIONS` preflight → return 200
- [ ] Reject non-`POST` → return 405
- [ ] Parse JSON body, extract `text` field
- [ ] Validate: `text` must be a non-empty string → return 400 if missing
- [ ] Truncate `text` to `MAX_TEXT_LENGTH` at the last sentence boundary (last `.` before limit) if longer
- [ ] Build request body:
  ```javascript
  {
    input: { text: truncatedText },
    voice: {
      languageCode: 'en-US',
      name: 'Kore',
      ssmlGender: 'FEMALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.05,
      pitch: 0.0,
    }
  }
  ```
- [ ] POST to `${TTS_API_URL}?key=${GOOGLE_API_KEY}` with `Content-Type: application/json`
- [ ] Handle non-200 → return 500 with `"TTS error: <status>"`
- [ ] Google returns `{ audioContent: '<base64 MP3>' }`
- [ ] Return `{ statusCode: 200, body: JSON.stringify({ audioBase64: result.audioContent }) }`
- [ ] Test: POST with `{ text: "Preheat the oven to 375." }` → verify audioBase64 returned

**Note:** Available voices use the newer naming convention (e.g. `Kore`, `Aoede`, `Gacrux`). If `Kore` is unavailable, other female options: `Aoede`, `Gacrux`, `Leda`, `Zephyr`.

---

### 4. Backend Unit Tests

Create `netlify/functions/__tests__/voice-stt.test.js`:

- [ ] Reuse `makeEvent` pattern from `recipe-chat.test.js` — adapt for binary/base64 bodies:
  ```javascript
  const makeBinaryEvent = (body, contentType = 'audio/webm;codecs=opus') => ({
    httpMethod: 'POST',
    headers: { 'content-type': contentType },
    body: body,
    isBase64Encoded: true,
  })
  ```
- [ ] `beforeEach`: `vi.restoreAllMocks()`, `process.env.GOOGLE_AI_KEY = 'test-key'`
- [ ] Test: returns 405 for GET requests
- [ ] Test: returns 413 for oversized body (>1.4M chars)
- [ ] Test: calls Google STT with correct URL and API key
- [ ] Test: returns `{ transcript, confidence }` from successful response
- [ ] Test: returns `{ transcript: '', confidence: 0 }` when STT returns no results (empty `results` array)
- [ ] Test: returns 500 when Google STT returns non-200

Create `netlify/functions/__tests__/voice-tts.test.js`:

- [ ] Reuse `makeEvent` pattern from `recipe-chat.test.js`
- [ ] Test: returns 400 when `text` is missing or empty
- [ ] Test: truncates text longer than 5000 chars at sentence boundary
- [ ] Test: calls Google TTS with correct voice config (`en-US-Journey-F`, `speakingRate: 1.05`)
- [ ] Test: returns `{ audioBase64 }` from successful response
- [ ] Test: returns 500 when Google TTS returns non-200

Run:
- [ ] `npm test` — all new tests pass alongside existing `recipe-chat.test.js` tests

---

### 5. Frontend — useVoiceMode.js Hook

Create `src/hooks/useVoiceMode.js`. Follows `useYouTubeAuth.js` structure (state + callbacks + return object).

**Hook signature:**
```javascript
export function useVoiceMode({ onTranscript, onAutoSubmit })
```
- `onTranscript(text)` — sets the input field value (wired to `setInput`)
- `onAutoSubmit()` — programmatically submits the form (wired to `formRef.current.requestSubmit()`)

**Returned object:**
```javascript
{
  voiceModeOn,        // boolean
  isListening,        // boolean
  isSpeaking,         // boolean
  toggleVoiceMode,    // () => void
  startListening,     // () => Promise<void>
  stopListening,      // () => void
  speakText,          // (text: string) => Promise<void>
  interruptSpeaking,  // () => void
  micPermission,      // 'granted' | 'denied' | 'prompt' | null
  error,              // string | null
}
```

#### Voice Mode Toggle (F7)

- [ ] `voiceModeOn` state, default `false`
- [ ] `toggleVoiceMode()`: flips boolean. On turn-off: call `interruptSpeaking()` and `stopListening()` to clean up
- [ ] Test: toggle on/off updates `voiceModeOn`

#### iOS Audio Unlock

- [ ] On `toggleVoiceMode(true)`, create and play a silent audio buffer to unlock the `AudioContext` for subsequent TTS playback:
  ```javascript
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const buffer = ctx.createBuffer(1, 1, 22050)
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(0)
  ```
- [ ] Store `AudioContext` in a ref for cleanup
- [ ] Test (iOS Safari): TTS playback works after toggling voice mode on

#### Mic Permission Check

- [ ] On first `toggleVoiceMode(true)`, check `navigator.permissions.query({ name: 'microphone' })` to set `micPermission`
- [ ] If permissions API not available (Safari), set to `'prompt'`
- [ ] Test: `micPermission` updates after permission check

#### Audio Recording (F1, F2)

- [ ] `startListening()`:
  1. If `isSpeaking`, call `interruptSpeaking()` first (F6)
  2. Call `navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`
  3. On permission denied: set `error` to `"Microphone access denied. Allow microphone in your browser settings."`, set `micPermission` to `'denied'`, return
  4. Select MIME type:
     - `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` → use it (Chrome, Firefox, Android)
     - Else try `'audio/mp4'` (Safari iOS/macOS)
     - Else omit `mimeType` (browser default)
  5. Create `MediaRecorder` from stream, store in ref
  6. Set `isListening` to `true`
  7. Call `recorder.start()` — single blob on stop
  8. Store `mediaStream` in ref for cleanup
  9. Start silence detection (see below)
- [ ] Test: startListening → getUserMedia called with correct constraints

#### Silence Detection (F4 — auto-stop)

Detects when the user stops speaking and automatically calls `stopListening()`. Purely client-side using Web Audio API `AnalyserNode`.

**Constants:**
```javascript
const SILENCE_THRESHOLD = 10    // average byte frequency below this = silence
const SILENCE_DURATION = 1500   // ms of continuous silence before auto-stop
const MIN_RECORDING_TIME = 500  // ms — don't auto-stop before this (avoid instant stop on mic init)
```

- [ ] In `startListening()`, after getUserMedia succeeds:
  1. Create `AudioContext` and connect `mediaStream` to an `AnalyserNode`:
     ```javascript
     const audioContext = new (window.AudioContext || window.webkitAudioContext)()
     const source = audioContext.createMediaStreamSource(stream)
     const analyser = audioContext.createAnalyser()
     analyser.fftSize = 512
     source.connect(analyser)
     ```
  2. Store `audioContext` and `analyser` in refs
  3. Start a `requestAnimationFrame` loop that checks volume levels:
     ```javascript
     const dataArray = new Uint8Array(analyser.frequencyBinCount)
     let silenceStart = null
     const recordingStart = Date.now()

     const checkSilence = () => {
       if (!isListeningRef.current) return
       analyser.getByteFrequencyData(dataArray)
       const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

       if (average < SILENCE_THRESHOLD) {
         if (!silenceStart) silenceStart = Date.now()
         if (Date.now() - silenceStart > SILENCE_DURATION
             && Date.now() - recordingStart > MIN_RECORDING_TIME) {
           stopListening()
           return
         }
       } else {
         silenceStart = null  // reset on any speech
       }
       requestAnimationFrame(checkSilence)
     }
     requestAnimationFrame(checkSilence)
     ```
- [ ] Use `isListeningRef` (a ref mirroring `isListening` state) so the rAF loop can read current value without stale closure
- [ ] Clean up `AudioContext` in `stopListening()` and in the unmount cleanup
- [ ] User can still tap mic button to stop manually at any time (manual stop and auto-stop both call the same `stopListening()`)
- [ ] Test: speak then go silent for 1.5s → `stopListening` is called automatically
- [ ] Test: `SILENCE_THRESHOLD` may need tuning per environment — document as a configurable constant

#### Stop Recording and Submit (F3, F4)

- [ ] `stopListening()`:
  1. Guard: if `mediaRecorder` ref is null or state is not `'recording'`, return (prevents double-stop from manual tap + silence detection racing)
  2. Call `mediaRecorder.stop()`
  3. Close `AudioContext` used for silence detection
  4. In `ondataavailable`: collect the blob
  5. In `onstop`:
     - Stop all tracks on `mediaStream` (release mic hardware)
     - Set `isListening` to `false`
     - Send blob to STT:
       ```javascript
       const res = await fetch('/.netlify/functions/voice-stt', {
         method: 'POST',
         headers: { 'Content-Type': mediaRecorder.mimeType },
         body: blob,
       })
       const { transcript } = await res.json()
       ```
     - If transcript is empty: set `error` to `"Didn't catch that. Try again."` (auto-clear after 3s via `setTimeout`), do not submit
     - If transcript is non-empty: call `onTranscript(transcript)` (F3), then `setTimeout(() => onAutoSubmit(), 0)` to let React flush the state update (F4)
  6. On fetch error: set `error` to `"Voice transcription failed. Try typing instead."`
- [ ] Test: start → silence detected → stop → verify blob sent to voice-stt endpoint

#### TTS Playback (F5)

- [ ] `speakText(text)`:
  1. If `!voiceModeOn`, return
  2. Call `interruptSpeaking()` to cancel any current playback
  3. Fetch audio:
     ```javascript
     const res = await fetch('/.netlify/functions/voice-tts', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ text }),
     })
     const { audioBase64 } = await res.json()
     ```
  4. Create `Audio` element: `new Audio(\`data:audio/mp3;base64,${audioBase64}\`)`
  5. Store in `audioRef`
  6. Set `isSpeaking` to `true`
  7. `audio.play()`
  8. On `audio.onended`: set `isSpeaking` to `false`
  9. On fetch error: log and silently degrade (text answer is already visible)
- [ ] Test: `speakText("Preheat the oven.")` → verify fetch called, `isSpeaking` set to true

#### TTS Interrupt (F6)

- [ ] `interruptSpeaking()`:
  1. If `audioRef.current`: `audioRef.current.pause()`, `audioRef.current.currentTime = 0`, `audioRef.current = null`
  2. Set `isSpeaking` to `false`
- [ ] Test: interrupt while speaking → audio stops, `isSpeaking` becomes false

#### Cleanup

- [ ] Return cleanup function for `useEffect` unmount: stop active recording, release mediaStream tracks, stop TTS playback

---

### 6. Frontend — RecipePage.jsx Integration

Modify `src/pages/RecipePage.jsx`. Changes scoped to the chat panel and hook wiring.

#### Hook Wiring

- [ ] Import `useVoiceMode` from `'../hooks/useVoiceMode'`
- [ ] Import `useRef`, `useCallback` (add to existing React import)
- [ ] Add `formRef = useRef(null)` for programmatic submit
- [ ] Create `handleAutoSubmit` callback:
  ```javascript
  const handleAutoSubmit = useCallback(() => {
    setTimeout(() => formRef.current?.requestSubmit(), 0)
  }, [])
  ```
- [ ] Initialize hook:
  ```javascript
  const {
    voiceModeOn, isListening, isSpeaking,
    toggleVoiceMode, startListening, stopListening,
    speakText, interruptSpeaking, micPermission, error: voiceError,
  } = useVoiceMode({ onTranscript: setInput, onAutoSubmit: handleAutoSubmit })
  ```
- [ ] Test: hook initializes without errors, `voiceModeOn` defaults to false

#### TTS Trigger on Assistant Response (F5)

- [ ] Add a ref to track previous `chatLoading` value: `const prevLoadingRef = useRef(false)`
- [ ] Add `useEffect`:
  ```javascript
  useEffect(() => {
    if (prevLoadingRef.current && !chatLoading && voiceModeOn && messages.length > 0) {
      const last = messages[messages.length - 1]
      if (last.role === 'assistant') speakText(last.text)
    }
    prevLoadingRef.current = chatLoading
  }, [chatLoading, voiceModeOn, messages, speakText])
  ```
- [ ] Test: send question with voice mode on → assistant response is spoken aloud

#### Voice Mode Toggle Button (F7)

- [ ] Add toggle button next to the `"Ask about this recipe"` heading in `chatPanel`:
  ```jsx
  <div className="flex items-center justify-between mb-3">
    <h2 className="text-lg font-semibold text-gray-900">Ask about this recipe</h2>
    <button
      onClick={toggleVoiceMode}
      className={`p-2 rounded-full transition-colors ${
        voiceModeOn ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:text-gray-600'
      }`}
      aria-label={voiceModeOn ? 'Turn off voice mode' : 'Turn on voice mode'}
    >
      {/* Speaker/volume SVG icon */}
    </button>
  </div>
  ```
- [ ] Test: toggle changes visual state (purple highlight when on)

#### Mic Button (F1)

- [ ] Add mic button between the text input and send button in the form:
  ```jsx
  <button
    type="button"
    onClick={isListening ? stopListening : startListening}
    disabled={chatLoading || !voiceModeOn}
    className={`relative p-2 rounded-full ${
      isListening ? 'bg-red-100 text-red-600' : 'text-gray-400'
    } ${!voiceModeOn ? 'opacity-30 cursor-not-allowed' : ''}`}
    aria-label={isListening ? 'Stop recording' : 'Start recording'}
  >
    {/* Microphone SVG icon */}
  </button>
  ```
- [ ] Mic button disabled when voice mode off or `chatLoading` true
- [ ] Test: mic button renders, is disabled when voice mode off

#### Listening Indicator (F2)

- [ ] Wrap mic button in a `relative` container and overlay a pulsing ring when `isListening`:
  ```jsx
  {isListening && (
    <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-25" />
  )}
  ```
- [ ] Tailwind's `animate-ping` is already available — no config change needed
- [ ] Test: pulsing ring visible when recording, hidden when stopped

#### Voice Error Display

- [ ] Below the form, conditionally render error:
  ```jsx
  {voiceError && (
    <p className="text-xs text-red-500 mt-1">{voiceError}</p>
  )}
  ```
- [ ] Test: deny mic permission → error message appears inline

#### Form Ref

- [ ] Add `ref={formRef}` to the existing `<form>` element (line 198)
- [ ] Test: `formRef.current.requestSubmit()` triggers `handleChatSubmit`

---

### 7. End-to-End Verification

- [ ] **Desktop Chrome — full hands-free flow:** Toggle voice mode on → tap mic → speak "what temperature should I bake this at?" → stop speaking → silence detection auto-stops recording after ~1.5s → transcript appears in input → auto-submits → assistant response → TTS reads answer aloud
- [ ] **Desktop Chrome — manual stop:** Tap mic → speak → tap mic to stop before silence detection kicks in → still works (manual and auto-stop are both valid)
- [ ] **Desktop Chrome — interrupt:** While TTS is reading, tap mic → TTS stops immediately → recording starts
- [ ] **Desktop Chrome — voice mode off:** Toggle off → mic button is disabled → assistant responses are not read aloud → text chat works exactly as before
- [ ] **iOS Safari:** Same hands-free flow → verify `getUserMedia` prompt appears, recording works, silence detection stops recording, STT returns transcript, TTS plays (iOS audio unlock works)
- [ ] **Permission denied:** Deny microphone in browser settings → tap mic → error message appears → no crash → text input still works
- [ ] **Empty transcript / silence only:** Tap mic → say nothing → silence detection stops recording → "Didn't catch that" message → no auto-submit
- [ ] **Silence threshold:** Test in a quiet room and with background noise (fan, music) → verify silence detection doesn't false-trigger during speech and does trigger within ~2s of actual silence. Tune `SILENCE_THRESHOLD` if needed.
- [ ] **Regression — text chat unchanged:** With voice mode off, type a question and send → exact same behavior as before, no visual changes to existing chat
