# Voice Chat Options Comparison

**Status:** Research Complete
**Date:** 2026-04-13
**Purpose:** Which STT/TTS approach should power hands-free cooking voice chat, given the existing stack (React + Netlify + Gemini 2.5 Flash + LangGraph roadmap)?

---

## TL;DR

- **Problem:** The recipe chat requires keyboard input — not viable when hands are covered in food
- **Current:** Text-only chat in `RecipePage.jsx` calling `recipe-chat.js` (Gemini 2.5 Flash)
- **Recommendation:** Google Cloud STT + TTS (Option B) — works on all mobile browsers including iOS, reuses existing Google credentials, and slots cleanly around the existing LangGraph roadmap
- **Decision:** Option A (Web Speech API) eliminated by iOS Safari bugs. Option C (Gemini Live) eliminated by incompatibility with LangGraph tool binding. Option B is the only path compatible with both the mobile-first requirement and the Phase 3/4 LangChain plans.

---

## Sequence Diagram

How each option handles a single voice turn:

```
OPTION A — Web Speech API
─────────────────────────────────────────────────────────────────────
┌──────────┐     ┌─────────────────────┐     ┌────────────────────┐
│  User    │     │  Browser (built-in)  │     │  recipe-chat.js    │
└────┬─────┘     └──────────┬──────────┘     └─────────┬──────────┘
     │                      │                           │
     │  Tap mic button       │                           │
     ├─────────────────────▶│                           │
     │                      │ SpeechRecognition.start() │
     │  Speaks question      │                           │
     ├─────────────────────▶│                           │
     │                      │ interimResults (live text)│
     │◀─────────────────────┤                           │
     │                      │ onend / pause detected    │
     │                      ├──────────────────────────▶│
     │                      │         answer text        │
     │                      │◀──────────────────────────┤
     │                      │ SpeechSynthesis.speak()   │
     │  Hears response       │                           │
     │◀─────────────────────┤                           │
     │                      │                           │


OPTION B — Google Cloud STT + TTS
─────────────────────────────────────────────────────────────────────
┌──────────┐  ┌────────────┐  ┌───────────────┐  ┌────────────────┐
│  User    │  │  Browser   │  │ Netlify Fns   │  │ recipe-chat.js │
└────┬─────┘  └─────┬──────┘  └──────┬────────┘  └───────┬────────┘
     │               │                │                    │
     │  Tap mic       │                │                    │
     ├──────────────▶│                │                    │
     │               │ getUserMedia() │                    │
     │  Speaks        │                │                    │
     ├──────────────▶│                │                    │
     │               │ audio blob     │                    │
     │               ├───────────────▶│                    │
     │               │                │ Google Cloud STT   │
     │               │                │──────────────────▶ │
     │               │     transcript text                 │
     │               │                │◀──────────────────-│
     │               │    transcript  │                    │
     │               │◀───────────────┤                    │
     │               │  (shown in input field)             │
     │               │                                     │
     │               │         auto-submit question        │
     │               ├────────────────────────────────────▶│
     │               │              answer text            │
     │               │◀────────────────────────────────────┤
     │               │    answer text │                    │
     │               ├───────────────▶│                    │
     │               │                │ Google Cloud TTS   │
     │               │      audio data│                    │
     │               │◀───────────────┤                    │
     │  Hears response│                │                    │
     │◀──────────────┤                │                    │


OPTION C — Gemini Live API
─────────────────────────────────────────────────────────────────────
┌──────────┐     ┌──────────────────────────────────────────────────┐
│  User    │     │         Gemini Live WebSocket Session             │
└────┬─────┘     └────────────────────┬─────────────────────────────┘
     │                                │
     │  Tap mic / voice mode on        │
     ├───────────────────────────────▶│  STT + reasoning + TTS
     │  Speaks question                │  all handled inside session
     ├───────────────────────────────▶│
     │                                │  (no separate LLM call)
     │  Hears streamed audio response │
     │◀───────────────────────────────┤
     │                                │
     │  (LangGraph tools unavailable) │
```

---

## Architecture Diagram

How each option fits into the existing stack:

```
OPTION A — Web Speech API
┌─────────────────────────────────────────────┐
│                RecipePage.jsx                │
│                                              │
│  [🎤 Mic Button]                             │
│       │                                      │
│  SpeechRecognition (browser built-in)        │
│       │ interim text → input field           │
│       │ pause detected → auto-submit         │
│       ▼                                      │
│  handleChatSubmit() ──────────────────────▶ recipe-chat.js (unchanged)
│                                              │
│  SpeechSynthesis (browser built-in)          │
│       ◀─────────────────── answer text ──────┘
│  Reads response aloud                        │
└─────────────────────────────────────────────┘
  Backend changes: NONE
  New dependencies: NONE
  iOS Safari: ❌ BROKEN (isFinal always false, PWA silent failure)


OPTION B — Google Cloud STT + TTS  ← RECOMMENDED
┌─────────────────────────────────────────────┐
│                RecipePage.jsx                │
│                                              │
│  [🎤 Mic Button]                             │
│       │                                      │
│  getUserMedia() → MediaRecorder              │
│       │ audio blob                           │
│       ▼                                      │
│  /.netlify/functions/voice-stt  ─────────▶  Google Cloud Speech-to-Text
│       │ transcript text         ◀─────────  (uses existing Google key)
│       │ shown in input field                 │
│       │ auto-submits after pause             │
│       ▼                                      │
│  /.netlify/functions/recipe-chat (unchanged) │
│       │ answer text                          │
│       ▼                                      │
│  /.netlify/functions/voice-tts  ─────────▶  Google Cloud Text-to-Speech
│       │ audio data              ◀─────────  (same Google key)
│  Audio plays / interrupt on speech           │
└─────────────────────────────────────────────┘
  Backend changes: 2 new Netlify functions
  New dependencies: Google Cloud Speech + TTS APIs (existing key)
  iOS Safari: ✅ Works (getUserMedia supported iOS 14.3+)


OPTION C — Gemini Live API
┌─────────────────────────────────────────────┐
│                RecipePage.jsx                │
│                                              │
│  [🎤 Mic Button]                             │
│       │                                      │
│  WebSocket → Gemini Live Session             │
│       │ audio in / audio out                 │
│       │ STT + LLM + TTS all inside session   │
│       │                                      │
│       ✗ recipe-chat.js REPLACED              │
│       ✗ LangGraph agent tools BYPASSED       │
│       ✗ conversation history needs re-wiring │
└─────────────────────────────────────────────┘
  Backend changes: recipe-chat.js replaced entirely
  LangGraph compatibility: No native integration
  iOS Safari: ✅ Works (WebSocket + Web Audio)
```

---

## Data Flow Diagram

Decision tree that eliminates options and arrives at the recommendation:

```
Start: Need hands-free voice chat for cooking
│
├── Mobile-first (iOS Safari primary)?
│    Yes
│    │
│    └── Option A (Web Speech API) viable on iOS?
│         │
│         ├── SpeechRecognition.isFinal always returns false on iOS?  YES → ❌ Eliminate Option A
│         ├── SpeechRecognition silently dies when app is PWA?        YES → ❌ Confirm elimination
│         └── Workaround available?  Fragile 750ms silence timeout only — not reliable
│
└── LangGraph tool binding required (Phase 3 + Phase 4)?
     Yes — agent tools, RAG, semantic search all depend on it
     │
     └── Option C (Gemini Live) compatible with LangGraph?
          │
          ├── Official LangChain integration for Gemini Live?          NO
          ├── Community workaround exists?                             YES (1 repo)
          └── LangGraph tool-binding works natively inside Live?       NO → ❌ Eliminate Option C
               Manual bridge required for every agent tool


Result: Option B (Google Cloud STT + TTS)
     │
     ├── Works on iOS Safari (getUserMedia, not WebKit SpeechRecognition)?  ✅
     ├── Reuses existing Google API key?                                     ✅
     ├── recipe-chat.js unchanged?                                           ✅
     ├── LangGraph tools work natively?                                      ✅
     ├── Live interim transcription (words appear as spoken)?                Via polling audio chunks
     ├── Auto-submit on pause detection?                                     ✅
     ├── Interrupt on new speech?                                            ✅ (stop Audio playback)
     └── Kitchen noise handling?                                             getUserMedia constraints
                                                                             (echoCancellation,
                                                                              noiseSuppression,
                                                                              autoGainControl)
```

---

## Problem vs Solution Matrix

| Criteria | Option A — Web Speech API | Option B — Google Cloud STT/TTS | Option C — Gemini Live |
|----------|--------------------------|----------------------------------|------------------------|
| iOS Safari STT | ❌ Broken (isFinal bug, PWA failure) | ✅ getUserMedia works iOS 14.3+ | ✅ WebSocket works |
| Auto-submit (pause detection) | ❌ No reliable end-of-speech on iOS | ✅ Silence detection on recorded audio | ✅ Built-in |
| Live interim transcription | ✅ Native (interimResults) | ⚠️ Requires chunked streaming or polling | ✅ Built-in |
| TTS voice quality | ❌ Robotic (Remy project dropped it) | ✅ Neural voices, configurable | ✅ Best |
| Speak-to-interrupt | ✅ 1 line (speechSynthesis.cancel) | ✅ Stop Audio element on voice onset | ✅ Built-in |
| Backend changes | None | 2 new Netlify functions | Replace recipe-chat.js entirely |
| LangGraph compatibility | N/A (client-side only) | ✅ Fully compatible — independent layers | ❌ No native integration |
| LangGraph Phase 3 tools | N/A | ✅ Works unchanged | ❌ Manual bridge required |
| LangGraph Phase 4 RAG | N/A | ✅ Works unchanged | ❌ Manual bridge required |
| Uses existing credentials | ✅ No credentials needed | ✅ Existing Google key | ✅ Existing Gemini key |
| Cost | Free | ~$0.006/15s STT + $4/1M chars TTS | Gemini pricing |
| Production maturity | Stable (broken on iOS) | Stable | Newer, less established |
| Kitchen noise handling | getUserMedia constraints (same) | getUserMedia constraints + pre-send processing | Built-in noise handling |

---

## Real-World Examples

**Remy — HackZurich 2023 cooking voice assistant**
[github.com/SimonIyamu/Remy-Your-cooking-voice-assistant](https://github.com/SimonIyamu/Remy-Your-cooking-voice-assistant)
- Stack: React + Web Speech API (STT) + ElevenLabs (TTS) + Firebase
- **Key finding:** Explicitly dropped browser `SpeechSynthesis` due to unacceptable voice quality, paid for ElevenLabs TTS. Closest published stack to Recipe Loop.
- **Lesson:** Browser TTS quality is a real problem in production cooking apps, not just a hypothetical.

**Handsfree Cooking — web component**
[handsfreecooking.com](https://www.handsfreecooking.com/)
- Pure browser Web Speech API for recipe step navigation, no backend.
- No published notes on iOS or kitchen noise outcomes. Desktop-only use case implied.
- **Lesson:** Web Speech API works for desktop cooking apps. Not a signal for mobile.

**sidhyaashu/multimodal-live-rag-voice**
[github.com/sidhyaashu/multimodal-live-rag-voice](https://github.com/sidhyaashu/multimodal-live-rag-voice)
- Combines LangGraph + Gemini Live via WebSocket, but LangGraph sits alongside the Live session rather than inside it.
- Tool calls from the Live API require manual client-side wiring — not through LangGraph's tool-binding system.
- **Lesson:** LangGraph + Gemini Live is possible as a workaround, not a supported integration. Every new agent tool adds manual wiring overhead.

**Andrea Giammarchi — "Taming the Web Speech API"**
[webreflection.medium.com](https://webreflection.medium.com/taming-the-web-speech-api-ef64f5a245e1)
- Most thorough production writeup on Web Speech API bugs found. Documented: `isFinal` always `false` on iOS Safari, `audiostart` events only (no result events), complete silence in PWA mode.
- Workaround: enable `interimResults`, use 750ms silence timeout. Still slower than Chrome, still unreliable.
- **Lesson:** iOS Safari Web Speech API bugs are real, documented, open in WebKit since iOS 15, and have no clean fix.

---

## Side-by-Side Comparison

### STT approach: Web Speech API vs Google Cloud

```javascript
// ❌ OPTION A — Web Speech API
// Breaks silently on iOS Safari PWA. isFinal never true on iOS.
const recognition = new webkitSpeechRecognition()
recognition.interimResults = true
recognition.onresult = (e) => {
  const transcript = Array.from(e.results)
    .map(r => r[0].transcript).join('')
  setInput(transcript)
  // isFinal is always false on iOS — auto-submit never fires
  if (e.results[e.results.length - 1].isFinal) {
    handleChatSubmit()
  }
}


// ✅ OPTION B — Google Cloud STT
// Works on all mobile browsers. Pause detection is reliable.
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,   // helps in noisy kitchens
    autoGainControl: true,
  }
})
const recorder = new MediaRecorder(stream)
recorder.ondataavailable = async (e) => {
  const audioBlob = e.data
  const res = await fetch('/.netlify/functions/voice-stt', {
    method: 'POST',
    body: audioBlob,
  })
  const { transcript } = await res.json()
  setInput(transcript)
  handleChatSubmit()  // auto-submit
}
```

### TTS approach: Browser SpeechSynthesis vs Google Cloud

```javascript
// ❌ OPTION A — Browser SpeechSynthesis
// Robotic quality. Remy dropped this in production.
const utterance = new SpeechSynthesisUtterance(answer)
speechSynthesis.speak(utterance)

// Interrupt: one line, works reliably
speechSynthesis.cancel()


// ✅ OPTION B — Google Cloud TTS
// Neural voice quality. Same interrupt pattern.
const res = await fetch('/.netlify/functions/voice-tts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: answer }),
})
const { audioBase64 } = await res.json()
const audio = new Audio(`data:audio/mp3;base64,${audioBase64}`)
audioRef.current = audio
audio.play()

// Interrupt: stop on new speech onset
audioRef.current?.pause()
```

### LangGraph compatibility: Option B vs Option C

```javascript
// ✅ OPTION B — Google Cloud STT/TTS
// recipe-chat.js is completely unchanged.
// Voice is just the I/O wrapper.

// voice-stt.js (new)
export async function handler(event) {
  // audio blob → Google Cloud STT → transcript text
}

// recipe-chat.js (unchanged — LangGraph agent drops in here in Phase 3)
export async function handler(event) {
  const { question, transcript, history } = JSON.parse(event.body)
  // ... existing Gemini / future LangGraph call unchanged
}

// voice-tts.js (new)
export async function handler(event) {
  // answer text → Google Cloud TTS → audio base64
}


// ❌ OPTION C — Gemini Live
// recipe-chat.js is replaced. LangGraph tools need manual wiring
// into the Live session's tool_call / tool_response protocol.
// Every Phase 3 tool (ingredient lookup, step navigator) and
// Phase 4 RAG tool requires a manual WebSocket message handler.

const session = await ai.live.connect({ model: 'gemini-2.0-flash-live' })
session.on('tool_call', async (toolCall) => {
  // Manual dispatch to each LangGraph tool — no native binding
  if (toolCall.name === 'ingredient_lookup') { ... }
  if (toolCall.name === 'step_navigator') { ... }
  if (toolCall.name === 'semantic_search') { ... }
  await session.sendToolResponse({ ... })
})
```

---

## Sources

- [Remy — cooking voice assistant (GitHub)](https://github.com/SimonIyamu/Remy-Your-cooking-voice-assistant)
  - HackZurich 2023 project, closest published stack to Recipe Loop. Confirms browser TTS quality problem in production.

- [Handsfree Cooking web component](https://www.handsfreecooking.com/)
  - Pure Web Speech API, desktop-oriented. No iOS or kitchen noise findings published.

- [Taming the Web Speech API — Andrea Giammarchi](https://webreflection.medium.com/taming-the-web-speech-api-ef64f5a245e1)
  - Most thorough production writeup on iOS Safari Web Speech API bugs. Documents isFinal, PWA, and WebView failures.

- [WebKit Documentation issue #120](https://github.com/WebKit/Documentation/issues/120) — interimResults/isFinal broken Safari iOS
  - Open bug, unresolved since iOS 15.

- [WICG speech-api issue #96](https://github.com/WICG/speech-api/issues/96) — SpeechRecognition Safari
  - Confirms isFinal always false on Safari Mobile.

- [Preventing speaker feedback with Web Audio API — dev.to](https://dev.to/fosteman/how-to-prevent-speaker-feedback-in-speech-transcription-using-web-audio-api-2da4)
  - getUserMedia constraints (echoCancellation, noiseSuppression, autoGainControl) and DynamicsCompressorNode as kitchen noise mitigation — applies equally to Options B and C.

- [sidhyaashu/multimodal-live-rag-voice (GitHub)](https://github.com/sidhyaashu/multimodal-live-rag-voice)
  - Only community example of LangGraph + Gemini Live. LangGraph sits alongside the WebSocket session, not inside it. Tool binding is manual.

- [Gemini Live API — Tool use docs (Google AI)](https://ai.google.dev/gemini-api/docs/live-api/tools)
  - Official docs confirm tool calls in Live sessions use a separate protocol from standard Gemini function calling. No LangChain/LangGraph integration documented.

- [Build multimodal agents using Gemini, LangChain, and LangGraph — Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/build-multimodal-agents-using-gemini-langchain-and-langgraph)
  - Official Google + LangGraph integration docs. Covers standard (non-Live) Gemini calls only. Live API absent.

- [WhisperChef — Gemini multimodal cooking assistant (IJRASET)](https://www.ijraset.com/research-paper/an-ai-powered-multimodal-recipe-generation-and-voice-cooking-assistant)
  - 2025 academic cooking assistant using Gemini multimodal + voice. No published production data or LangChain integration.
