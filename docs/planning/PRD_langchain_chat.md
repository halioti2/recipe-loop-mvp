# LangChain Chat Enhancement - PRD

## Overview
Upgrade the recipe chat assistant in four phases: improve reasoning accuracy immediately with a thinking budget increase, then add timestamp-aware chunking for video playback, then a LangGraph ReAct agent for multi-step reasoning, then cross-recipe semantic search over the full library.

---

## 1. User Stories

### As a Home Cook

#### Accurate Answers (Phase 1)
- I want the chat to give me complete ingredient lists without missing items
- I want follow-up questions to build naturally on prior answers

#### Video Playback (Phase 2)
- I want to ask "how do I cut the tomatoes?" and have the video jump to that moment
- I want to click a timestamp in the chat response to jump straight to that part of the video
- I want the chat to work on long recipe videos (25+ min) the same way it works on short ones

#### Smarter Chat (Phase 3)
- I want the assistant to reason through multi-step questions (e.g. "what can I sub for butter in the sauce step?") rather than giving generic answers
- I want the assistant to look up specific ingredients or steps when answering rather than guessing from memory

#### Cross-Recipe (Phase 4)
- I want to ask "what can I make tonight with chicken thighs and miso?" across all my recipes
- I want the assistant to find relevant recipes from my library when I describe what I have or want

---

## 2. Functional Requirements

### Phase 1 — Thinking Budget (shipped)

| # | Requirement | Status |
|---|-------------|--------|
| T1 | Increase `thinkingBudget` from 0 to 1024 in `recipe-chat.js` | Done |

**Why:** The confirmed accuracy failure (Tabasco miss on Buffalo Wings, 15,419 chars) was a reasoning failure at `thinkingBudget: 0`, not a context window problem. At 1024 the miss is resolved. +622ms latency. No pipeline changes required.

---

### Phase 2 — Transcript Chunking + Timestamp Playback

| # | Requirement | Status |
|---|-------------|--------|
| C1 | Strip noise tokens (`[Music]`, `[Applause]`, standalone timestamps) then split transcripts ≥5,000 chars into overlapping chunks using `RecursiveCharacterTextSplitter` with punctuation-first separators (`". "`, `"? "`, `"! "`, `" "`, `""`) — `chunkSize: 1500`, `chunkOverlap: 150` | Todo |
| C2 | Store per-chunk `start_ms`/`end_ms` by embedding Supadata `offset` values into the string pre-join and parsing them back out post-split (Hybrid approach from `RE_chunking_strategy_comparison.md`) | Todo |
| C3 | Store chunks in `recipes.transcript_chunks` (jsonb array of `{ text, start_ms, end_ms }`) and set `recipes.transcript_chunked_at` on completion | Todo |
| C4 | Chat response includes `source_ms` timestamp when an answer is grounded in a specific chunk | Todo |
| C5 | Frontend: clicking a timestamp in the chat seeks the YouTube embed to that position | Todo |

**Why Phase 2 needs chunking:** Timestamp playback requires knowing *where* in the video each answer comes from. That's only possible with chunk-level `start_ms`/`end_ms`. This is the case where chunking is genuinely needed — not for context window reasons, but for video navigation.

---

### Phase 3 — LangGraph ReAct Agent

| # | Requirement | Status |
|---|-------------|--------|
| A1 | Replace direct Gemini call in `recipe-chat.js` with LangGraph ReAct agent | Todo |
| A2 | Agent tool: ingredient lookup — query structured `ingredients` array for a recipe | Todo |
| A3 | Agent tool: step navigator — retrieve a specific cooking step by number or keyword from transcript chunks | Todo |
| A4 | Agent reasons in loops (reason → act → observe → respond) until it has a complete answer | Todo |
| A5 | Conversation history passed to agent on every turn | Todo |
| A6 | Frontend behaviour unchanged — user still sees a single answer per question | Todo |

---

### Phase 4 — Cross-Recipe Semantic Search (RAG)

| # | Requirement | Status |
|---|-------------|--------|
| R1 | Embed each transcript chunk (`text` field from Phase 2) using a text embedding model and store in `recipes.transcript_chunks` alongside existing fields | Todo |
| R2 | Enable pgvector on Supabase; add vector similarity index on chunk embeddings | Todo |
| R3 | Agent tool: `semantic_search` — takes a natural language query, retrieves top-k chunks across all recipes by cosine similarity | Todo |
| R4 | Agent uses `semantic_search` to answer cross-recipe questions ("what can I make with miso and chicken tonight?") | Todo |
| R5 | Results scoped to the authenticated user's recipe library | Todo |

---

## 3. Out of Scope

- Voice input
- Streaming agent responses token-by-token
- Grocery categorisation by store aisle (belongs in grocery list PRD)
- Manual recipe entry (no YouTube video required)

---

## 4. Data Model Changes

### Phase 1
No schema changes.

### Phase 2
New columns on the `recipes` table:

| Column | Type | Notes |
|--------|------|-------|
| `transcript_chunks` | jsonb | Array of `{ text, start_ms, end_ms }` objects |
| `transcript_chunked_at` | timestamptz | Set when chunking completes — used to skip already-chunked recipes |

### Phase 3
No new schema changes — agent uses existing `ingredients` and `transcript_chunks`.

### Phase 4
Extend `transcript_chunks` jsonb objects to include `embedding` (float[] vector), or store embeddings in a separate `chunk_embeddings` table if Supabase pgvector integration requires it. Decision deferred to Phase 4 implementation.

---

## 5. Build Order

```
Phase 1 — thinkingBudget: 1024 (1 line, shipped)
  └── Phase 2 — Chunking + timestamps (enables video playback)
        └── Phase 3 — LangGraph agent (builds on chunk-level step navigation)
              └── Phase 4 — pgvector RAG (embeds Phase 2 chunks, adds semantic_search tool to Phase 3 agent)
```

---

## 6. Open Questions

- What map and reduce prompts produce the best chunk summaries if Phase 2 requires them for the agent's step navigator? (OQ5/OQ6 in `RE_open_questions_chunking.md` — answered for summarisation use case, may need re-evaluation for retrieval use case)
- What embedding model for Phase 4? (text-embedding-3-small vs Gemini embedding vs other)
- Should Phase 4 semantic search be scoped to a single recipe or cross-library by default?
