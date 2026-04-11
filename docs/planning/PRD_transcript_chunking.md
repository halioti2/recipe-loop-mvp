# Transcript Chunking - PRD

## Overview
An enrichment pipeline upgrade that splits long recipe video transcripts into overlapping chunks using `RecursiveCharacterTextSplitter`, summarises each chunk via Gemini (map), then combines the summaries into a single recipe summary (reduce). The summary replaces the raw transcript as chat context for long videos, fixing accuracy failures on transcripts that exceed Gemini's reliable processing range. Timestamp support (`start_ms`/`end_ms` per chunk) is deferred to Phase 2 and will enable future video playback — letting users jump directly to the part of the video relevant to their question.

---

## 1. User Stories

### As a Home Cook

#### Using Chat on Long Videos
- I want the chat assistant to answer accurately about a 25+ min recipe video, not just the first few minutes
- I want the chat to work the same way on a long video as it does on a short one — I shouldn't have to think about video length

#### Timestamp Playback (Future — built towards by this PRD)
- I want to ask "how do I cut the tomatoes?" and have the video jump to the exact moment that step is shown
- I want to click a timestamp in the chat response to jump straight to that part of the video

---

## 2. Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| F1 | Strip noise tokens from transcript before chunking (`[Music]`, `[Applause]`, `[Laughter]`, standalone timestamps) | Todo |
| F2 | Detect whether a transcript requires chunking (threshold: >5,000 chars — real character counts confirm a clean gap between short videos <1,800 chars and long videos >7,600 chars) | Todo |
| F3 | Split transcript into overlapping chunks using `RecursiveCharacterTextSplitter` with punctuation-first separators (`". "`, `"? "`, `"! "`, `" "`, `""`) | Todo |
| F4 | ~~Store `start_ms` and `end_ms` timestamps on every chunk~~ — **Deferred to Phase 2.** RCTS works on the joined transcript string; Supadata `offset` values are discarded in the join step before RCTS runs. Timestamps can be recovered in Phase 2 by embedding offsets into the string pre-join and parsing them back out post-split. | Phase 2 |
| F5 | Summarise each chunk individually via Gemini (map phase) | Todo |
| F6 | Combine chunk summaries into a single recipe summary via Gemini (reduce phase) | Todo |
| F7 | Store chunks (without timestamps) in `recipes.transcript_chunks` (jsonb array) | Todo |
| F8 | Store combined summary in `recipes.transcript_summary` | Todo |
| F9 | Short videos (<5,000 chars) skip chunking — raw transcript used directly, no chunks or summary stored | Todo |
| F10 | `recipe-chat.js` uses `transcript_summary` when available, falls back to raw `transcript` | Todo |
| F11 | Chunking runs as a standalone script triggered manually (or via admin button), separate from the enrich pipeline. Skips recipes where `transcript_chunked_at` is already set. | Todo |

---

## 3. Out of Scope (for now)

- Timestamp-based video playback UI (built towards by F4/F7 but not implemented in this phase)
- Chunk embeddings and vector search (Phase 3)
- Parent-child chunking
- Semantic chunking (limited JS support, higher cost)
- Re-chunking videos when transcript is updated
- Sponsor segment detection (identified as a gap in `RE_transcript_boundary_analysis.md` — not in scope for Phase 1)
- Outro/sign-off detection (same — identified but deferred)

---

## 4. Chunking Approach — RCTS for Phase 1, Hybrid for Phase 2

**Phase 1 uses `RecursiveCharacterTextSplitter`** with punctuation-first separators. This is simpler to implement and sufficient for the Phase 1 goal: getting chat to work accurately on long videos. Timestamps are not required for this.

**Phase 2 will switch to the Hybrid approach** (time window + punctuation snap) when timestamp playback is built. RCTS loses Supadata `offset` values at the join step — the pipeline joins segments as `.map(c => c.text).join(' ')` before RCTS runs. Timestamps can be recovered by embedding offsets into the string pre-join (`[${c.offset}] text`) and parsing them back out post-split, but this is deferred.

**Why not the Hybrid approach in Phase 1:**
- The Hybrid (time window + punctuation snap) was the original recommendation when timestamps were in scope for this phase
- Boundary analysis confirmed 86% of hard time-based cuts are mid-sentence (31 of 36 boundaries tested) — punctuation snapping is still needed in Phase 2
- RCTS with punctuation-first separators produces equally clean sentence cuts with less implementation complexity for Phase 1

---

## 5. Data Model

New columns on the `recipes` table:

| Column | Type | Notes |
|--------|------|-------|
| `transcript_chunks` | jsonb | Array of `{ text, summary }` objects. `start_ms`/`end_ms` added in Phase 2 when timestamp encoding is introduced. |
| `transcript_summary` | text | Combined summary from reduce phase. Null for short videos |
| `transcript_chunked_at` | timestamptz | Set when chunking completes — used to skip already-chunked recipes |

---

## 6. Chunking Parameters

The char threshold (F2/F9) is checked first — videos under 5,000 chars skip chunking entirely and use the raw transcript directly. The `chunkSize`, `chunkOverlap`, and separator parameters below only apply to videos that pass the threshold. At 1,500 char chunks, the three long videos in the current library would produce approximately 5 chunks each (Breakfast, Honey Miso) and ~10 chunks (Buffalo Wings).

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Separators | `". "`, `"? "`, `"! "`, `" "`, `""` | Punctuation-first ensures cuts land at sentence boundaries. Falls back to spaces only when no sentence end exists within `chunkSize`. |
| `chunkSize` | 1,500 chars | Starting point per Apify transcript-specific guidance. Needs empirical tuning once real chunk quality is observed. |
| `chunkOverlap` | 150 chars | ~10% of chunk size. Prevents losing content at boundaries. |
| Char threshold | >5,000 chars | Real transcript data confirms a clean gap — short videos top out at 1,790 chars, long videos start at 7,686 chars. Checked via `transcript.length`. |
| Noise stripping | `[Music]`, `[Applause]` etc. | Confirmed pervasive — present in 5 of 8 boundaries in Honey Miso Short Rib alone |

---

## 7. Decisions

| Question | Decision |
|----------|----------|
| Should chunking run retroactively or only on new recipes? | **Standalone script triggered by button** — not wired into the enrich pipeline. Runs retroactively on existing recipes on demand. Can be automated after enrich once parameters are stable. The 3 recipes with no transcript need re-enriching first; Crème this brûlée (no Supadata segments) cannot be chunked. |
| How do we handle a Gemini error mid-reduce? | **Store chunk summaries incrementally as each map call returns. Retry only the reduce step on failure.** Map calls are the expensive part — don't re-run them if reduce fails. `transcript_chunked_at` is only set when reduce succeeds, so the script can safely resume from the reduce step. |
| Individual Gemini calls per chunk or one call for all chunks? | **Individual parallel calls (`Promise.all`) for the map phase.** One call per chunk, all fired in parallel. Scales to any video length, enables per-chunk retry, and avoids Gemini giving unequal attention across a long multi-section prompt. |
| What `chunkSize` produces the best summaries for recipe content? | Deferred — 1,500 chars is the starting point, loosely derived from Apify's 200–400 token guidance for transcript RAG pipelines (200–400 tokens ≈ 800–1,600 chars). The underlying reasoning from that source is not fully validated for recipe-specific content. Needs empirical testing once real summaries are generated. |
| Should sponsor segments be stripped before chunking? | Deferred — confirmed present in Breakfast Every Day (6:00 boundary). Not in scope for Phase 1. |
