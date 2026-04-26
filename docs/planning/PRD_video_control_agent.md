# Video Control Agent - PRD

## Overview
Let users control the recipe video through natural language commands in the chat. A user can say "pause the video", "rewind 30 seconds", or "skip to where they add the butter" and the assistant executes the command directly on the embedded player. Three phases: basic transport controls, instruction-based seek using the full timestamped transcript, and a chunking upgrade that replaces full-transcript seek with vector search once `PRD_langchain_chat.md` Phase 2 is complete.

---

## 1. User Stories

### As a Home Cook

#### Hands-Free Video Control
- I want to say "pause" while my hands are covered in dough so I don't have to touch my phone
- I want to say "go back 30 seconds" when I miss a step without fumbling for the scrubber
- I want to say "play" to resume after I've finished a step

#### Instruction-Based Seeking
- I want to say "skip to when they make the sauce" and have the video jump there
- I want to say "go back to the part where they season the chicken" and land at the right moment
- I want the assistant to tell me it can't find that step if it doesn't exist in the video

---

## 2. Functional Requirements

### Phase A — IFrame API + Basic Transport Controls

| # | Requirement | Status |
|---|-------------|--------|
| V1 | Replace the plain `<iframe>` embed with a YouTube IFrame Player API instance so the frontend can call `playVideo()`, `pauseVideo()`, `seekTo()` | Todo |
| V2 | Agent tool: `play_video` — resumes playback | Todo |
| V3 | Agent tool: `pause_video` — pauses playback | Todo |
| V4 | Agent tool: `rewind_seconds(n)` — seeks to `currentTime - n` seconds (default 30, clamped to 0) | Todo |
| V5 | Agent tool: `seek_to_seconds(n)` — seeks the player to an absolute position in seconds; this is the frontend seek primitive that Phase B's instruction-based seek will reuse | Todo |
| V6 | Assistant confirms the action in its reply ("Rewound 30 seconds.") rather than returning recipe text | Todo |

---

### Phase B — Instruction-Based Seek

*Does NOT depend on `PRD_langchain_chat.md` Phase 2. Requires only that timestamps are preserved in the `transcript` column (see S1 below).*

| # | Requirement | Status |
|---|-------------|--------|
| S1 | Update `playlist-enrich-processor.js` to store timestamps inline when saving the transcript: `transcriptData.content.map(c => \`[${formatTime(c.offset)}] ${c.text}\`).join(' ')` — existing recipes need re-enrichment after this change | Todo |
| S2 | Agent tool: `seek_to_instruction(query)` — Gemini reads the full timestamped transcript already in the system prompt, identifies the matching moment, and returns a `seek_to_seconds(n)` tool call. No separate vector search required. | Todo |
| S3 | If Gemini cannot identify a matching moment with confidence, it replies that it couldn't find that step rather than guessing a timestamp | Todo |
| S4 | Assistant confirms the seek in its reply ("Jumped to 4:32 — that's where they start the sauce.") | Todo |

---

### Phase C — Chunking + LangGraph Seek

*Depends on Phase B being complete and on `PRD_langchain_chat.md` Phase 2 (transcript chunks with `start_ms`/`end_ms`) being complete. Replaces Phase B's full-transcript approach with vector search when transcripts grow too long or cross-recipe seek is needed.*

| # | Requirement | Status |
|---|-------------|--------|
| C1 | Migrate `seek_to_instruction` from full-transcript Gemini reasoning to a LangGraph ReAct agent that calls `semantic_search(query)` over stored `transcript_chunks` | Todo |
| C2 | Agent evaluates chunk match confidence and either calls `seek_to_seconds(start_ms / 1000)` or declines with a suggestion | Todo |
| C3 | Backend falls back to Phase B full-transcript approach for recipes that have not yet been chunked | Todo |

**Why Phase C over Phase B:** Phase B passes the entire transcript to Gemini on every seek query. For long videos (25+ min) this works today but consumes significant tokens and will degrade if transcripts grow. Phase C replaces the full-transcript read with a targeted vector search — only the matching chunk is passed to the model.

---

## 3. Out of Scope

- Fast-forward (jump forward N seconds) — rewind is the high-value cooking use case; forward-skip deferred
- Volume control
- Playback speed control via voice
- Cross-recipe video navigation
- Video control on any page other than the Recipe Detail page

---

## 4. Architecture Notes

### YouTube IFrame Player API
The current `<iframe>` embed must be replaced with the JavaScript IFrame Player API. The player is instantiated via `new YT.Player(elementId, { ... })` and exposes `playVideo()`, `pauseVideo()`, `seekTo(seconds)`, and `getCurrentTime()`. The player ref is held in React state and passed to wherever the agent tools execute their commands.

### Agent Design (Phase A)
Phase A does not require a full LangGraph agent — a structured Gemini response is sufficient. The chat handler detects transport intent, calls Gemini with a tool schema for `play_video` / `pause_video` / `rewind_seconds`, and the frontend executes the returned tool call against the player instance. This avoids the LangGraph dependency until Phase B needs multi-step reasoning.

### Agent Design (Phase B)
Phase B uses the same single Gemini call as Phase A. The full timestamped transcript is already in the system prompt — Gemini reads it, finds the matching moment, and returns a `seek_to_seconds` tool call directly. No LangGraph agent loop, no pgvector search. LangGraph remains relevant when Phase 2 chunking lands and cross-recipe semantic search is needed, but it is not required for Phase B.

### Command Routing
All messages go to a single Gemini call with all video tools defined. Gemini's tool selection handles routing — no separate classifier needed. See `RE_video_control_agent_design.md` for detail.

---

## 5. Build Order

```
Phase A — IFrame API + basic transport (play, pause, rewind, seek_to_seconds)
  └── Phase B — Instruction seek (full transcript, no chunking dependency)
        ├── S1: preserve timestamps in playlist-enrich-processor.js
        └── S2–S4: Gemini reads timestamped transcript, returns seek_to_seconds
              └── Phase C — Chunking upgrade (depends on PRD_langchain_chat Phase 2)
                    ├── C1: replace full-transcript seek with LangGraph + semantic_search
                    ├── C2: confidence-gated seek_to_seconds or decline
                    └── C3: fallback to Phase B for unchunked recipes
```

Phase A and Phase B are self-contained and shippable now. Phase C is gated on `PRD_langchain_chat.md` Phase 2 transcript chunking.

---

## 6. Open Questions

- Should the video player state (playing/paused/current time) be passed to the chat context so the assistant can give position-aware replies ("You're at 2:10, rewinding to 1:40.")?
- What is the minimum confidence threshold for `seek_to_instruction` before the agent should decline rather than seek?
- Should rewind default to 30 seconds, or should it be configurable per user request ("go back a little" vs "go back 2 minutes")?
- Does Phase C need to introduce a new Netlify function or can the LangGraph agent extend `recipe-chat.js` in place?
