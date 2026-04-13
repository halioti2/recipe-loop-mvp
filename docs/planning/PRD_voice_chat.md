# Voice Chat - PRD

## Overview
A voice mode for the recipe chat on the Recipe Detail page that lets users speak questions while cooking and hear the assistant's response read back aloud — keeping their hands free and eyes on the food.

---

## 1. User Stories

### As a Home Cook

#### Speaking to the Chat
- I want to tap a mic button and speak my question so I don't have to stop what I'm doing to type
- I want to see a clear visual indicator that the app is listening so I know when to speak
- I want to see my spoken words appear in the input field after I finish speaking so I can see what was heard
- I want the question to submit automatically once transcribed so the interaction feels natural

#### Hearing the Response
- I want the assistant's answer to be read aloud automatically while voice mode is on so I can keep my eyes on the recipe or the stove
- I want to interrupt the response by speaking a new question — playback should stop and the app should start listening
- I want responses to be read in a clear, natural-sounding voice (Google Cloud neural voices)

#### Controlling Voice Mode
- I want to toggle voice mode on/off with a single tap so I can switch back to typing when I'm not cooking
- I want voice mode to stay on for the session so I don't have to re-enable it with every question

---

## 2. Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| F1 | Mic button in the chat input area that starts/stops listening | Not started |
| F2 | Visual listening indicator (e.g. pulsing ring) while mic is active | Not started |
| F3 | Transcript appears in the input field after the user stops speaking (batch STT, not streaming — Netlify Functions have a 10s execution limit) | Not started |
| F4 | Auto-submit after transcript is returned (no tap required) | Not started |
| F5 | TTS reads every assistant response aloud while voice mode is active | Not started |
| F6 | Speaking while TTS is playing automatically interrupts and cancels playback | Not started |
| F7 | Voice mode toggle button; state persists for the session | Not started |

---

## 3. Out of Scope (for now)

- Always-on wake word detection ("Hey Recipe Loop")
- Streaming audio responses (speaking while text is still generating)
- Multilingual STT/TTS
- Native mobile app voice integration
- Offline/on-device voice processing
- Voice control for non-chat actions (e.g. "add to grocery list")

---

## 4. Technical Approach

**Selected: Option B — Google Cloud STT + TTS**

Option A (Web Speech API) was eliminated because `SpeechRecognition` is broken on iOS Safari (`isFinal` always `false`, silent failure in PWA mode — see `RE_voice_options_comparison.md`). Option C (Gemini Live) was eliminated because it has no native LangChain/LangGraph integration, which conflicts with the Phase 3/4 roadmap in `PRD_langchain_chat.md`.

| Option | STT | TTS | iOS Safari | LangGraph | Status |
|--------|-----|-----|------------|-----------|--------|
| A — Web Speech API | Browser SpeechRecognition | Browser SpeechSynthesis | ❌ Broken | N/A | Eliminated |
| **B — Google Cloud** | Cloud Speech-to-Text | Cloud Text-to-Speech | ✅ Works | ✅ Compatible | **Selected** |
| C — Gemini Live API | Gemini multimodal streaming | Gemini audio output | ✅ Works | ❌ No native integration | Eliminated |

**Why Option B:**
- Uses `getUserMedia` (works on all mobile browsers, including iOS Safari 14.3+)
- Reuses existing Google API key
- `recipe-chat.js` stays untouched — voice is just an I/O layer around the existing chat
- LangGraph agent (Phase 3) and RAG (Phase 4) drop in without changes
- Neural TTS voices — significantly better quality than browser SpeechSynthesis (Remy project explicitly dropped browser TTS)
- Cost: ~$0.006/15s STT + ~$4/1M chars TTS

**Backend additions:**
- `netlify/functions/voice-stt.js` — audio blob → Google Cloud Speech-to-Text → transcript text
- `netlify/functions/voice-tts.js` — answer text → Google Cloud Text-to-Speech → audio data

**Mobile-first UI notes:**
- Voice toggle and mic button must be thumb-reachable (bottom of screen)
- Pulsing indicator must be visible at arm's length
- Input field showing live transcription should be large enough to read while standing
- iOS autoplay restriction for TTS is satisfied by the voice mode toggle being a user gesture

---

## 5. Open Questions

- **Pause duration for auto-submit:** How long should the silence gap be before the question auto-submits? Too short and it cuts off mid-sentence; too long and the interaction feels sluggish. Likely needs tuning in testing (starting point: ~1.5s).
- **What happens if the mic is denied?** Need a clear fallback — hide the mic button or show an inline message explaining how to grant permission.
- **STT accuracy in noisy kitchens:** Google Cloud STT with `getUserMedia` constraints (`echoCancellation`, `noiseSuppression`, `autoGainControl`) should handle most kitchen noise. Needs real-world testing with extractor fans, sizzling, etc.
