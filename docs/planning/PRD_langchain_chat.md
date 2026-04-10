# LangChain Chat Enhancement - PRD

## Overview
Upgrade the recipe chat assistant from a single direct Gemini call to a LangChain-powered pipeline that handles long video transcripts reliably and a LangGraph ReAct agent that can reason over recipe data in multiple steps. Delivered in two phases: transcript chunking first, then the agent.

---

## 1. User Stories

### As a Home Cook

#### Long Video Support
- I want the chat to work on long recipe videos (25+ min) the same way it works on short ones
- I want answers that reflect the full recipe, not just the first few minutes of the transcript

#### Smarter Chat
- I want the assistant to reason through multi-step questions (e.g. "what can I sub for butter in the sauce step?") rather than giving generic answers
- I want the assistant to look up specific ingredients or steps when answering rather than guessing from memory
- I want follow-up questions to build naturally on prior answers

---

## 2. Functional Requirements

### Phase 1 — Transcript Chunking

| # | Requirement | Status |
|---|-------------|--------|
| C1 | Split full transcript into time-based chunks (e.g. 2–3 min segments) | Todo |
| C2 | Summarise each chunk using LangChain map-reduce chain | Todo |
| C3 | Store chunk summaries alongside the full transcript in Supabase | Todo |
| C4 | Chat uses summaries as context when full transcript exceeds Gemini context window | Todo |
| C5 | Short videos (<10 min) continue to use full transcript directly — no chunking overhead | Todo |

### Phase 2 — LangGraph ReAct Agent

| # | Requirement | Status |
|---|-------------|--------|
| A1 | Replace direct Gemini call in `recipe-chat.js` with LangGraph ReAct agent | Todo |
| A2 | Agent tool: ingredient lookup — query structured ingredient list for a recipe | Todo |
| A3 | Agent tool: step navigator — retrieve a specific cooking step by number or keyword | Todo |
| A4 | Agent reasons in loops (reason → act → observe → respond) until it has a complete answer | Todo |
| A5 | Conversation history passed to agent on every turn | Todo |
| A6 | Frontend behaviour unchanged — user still sees a single answer per question | Todo |

---

## 3. Out of Scope (for now)

- Voice input
- Cross-recipe agent tools ("which of my recipes uses the least oil?")
- Vector embeddings / pgvector semantic search
- Streaming agent responses token-by-token

---

## 4. Data Model Changes

### Phase 1
New columns on the `recipes` table:

| Column | Type | Notes |
|--------|------|-------|
| `transcript_chunks` | jsonb | Array of `{ start_time, end_time, text, summary }` objects |
| `transcript_chunked_at` | timestamptz | Set when chunking completes — used to skip already-chunked recipes |

### Phase 2
No new data model changes — agent uses existing `ingredients` and `transcript_chunks`.

---

## 5. Open Questions

- Should chunking run as part of the existing enrich pipeline, or as a separate background job triggered on first chat load?
- What chunk size gives the best balance between context coverage and Gemini call cost?
- Should we use LangChain JS or Python? (Current stack is JS — LangChain JS has full parity for these use cases)
