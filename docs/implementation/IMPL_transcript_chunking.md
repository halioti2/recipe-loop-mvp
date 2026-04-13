# Transcript Chunking — Phase 1 Implementation

**PRD:** `docs/planning/PRD_transcript_chunking.md`
**Scope:** Standalone chunking script that splits long transcripts with RCTS, summarises each chunk via Gemini (map), combines summaries (reduce), and stores results in Supabase. No pipeline wiring — triggered manually. Timestamps deferred to Phase 2.

---

## Functional Requirements Covered

| # | Requirement | Status |
|---|-------------|--------|
| F1 | Strip noise tokens (`[Music]`, `[Applause]`, `[Laughter]`, `>>` markers, standalone timestamps) from transcript before chunking | Todo |
| F2 | Detect whether a transcript requires chunking (threshold: >5,000 chars) | Todo |
| F3 | Split transcript into overlapping chunks using RCTS — `chunkSize: 1500`, `chunkOverlap: 150`, punctuation-first separators | Todo |
| F5 | Summarise each chunk individually via Gemini in parallel (`Promise.all`) — map phase | Todo |
| F6 | Combine chunk summaries into a single recipe summary via Gemini — reduce phase | Todo |
| F7 | Store chunks (text + per-chunk summary) in `recipes.transcript_chunks` (jsonb array) | Todo |
| F8 | Store combined summary in `recipes.transcript_summary` | Todo |
| F9 | Short transcripts (<5,000 chars) skip chunking — logged and skipped | Todo |
| F11 | Chunking runs as a standalone script triggered manually — skips recipes where `transcript_chunked_at` is already set | Todo |

## Out of Scope

| # | Requirement | Reason |
|---|-------------|--------|
| F4 | `start_ms`/`end_ms` timestamps per chunk | Phase 2 — requires Supadata offset encoding |
| F10 | `recipe-chat.js` reads `transcript_summary` | Follow-on frontend task — separate PR |

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `schema/add_transcript_chunking_columns.sql` | New — migration adding 3 columns to `recipes` table |
| `scripts/chunk-transcripts.js` | New — main chunking script |
| `netlify/functions/__tests__/chunking-utils.test.js` | New — unit tests for `stripNoise` and `rcts` utilities |

---

## Key Reuse

| Source | What to reuse |
|--------|--------------|
| `@langchain/textsplitters` | `RecursiveCharacterTextSplitter` — install package, import directly |
| `scripts/test-map-prompt.js` | MAP_PROMPT string — copy verbatim |
| `scripts/test-reduce-prompt.js` | REDUCE_PROMPT string — copy verbatim |
| `netlify/functions/playlist-enrich-processor.js` | Gemini fetch pattern + code-fence strip before JSON.parse |
| `netlify/functions/__tests__/recipe-chat.test.js` | Vitest import/describe/mock pattern |

---

## Implementation Checklist

### Install Dependency
- [ ] `npm install @langchain/textsplitters`
- [ ] Verify: `import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'` resolves in a test script

### Migration
- [ ] Create `schema/add_transcript_chunking_columns.sql` adding `transcript_chunks JSONB`, `transcript_summary TEXT`, `transcript_chunked_at TIMESTAMPTZ` and a partial index on `transcript_chunked_at IS NULL`
- [ ] Apply migration in Supabase SQL editor
- [ ] Verify: confirm the three columns exist on the `recipes` table

### Utility Functions (exported from script for testability)
- [ ] Implement `stripNoise(text)` — removes `[Music]`, `[Applause]`, `[Laughter]`, `[Cheering]`, `>>` markers, and standalone `HH:MM` timestamps using regex
- [ ] Export `stripNoise` as a named export from `scripts/chunk-transcripts.js`
- [ ] Use `RecursiveCharacterTextSplitter` from `@langchain/textsplitters` directly — `chunkSize: 1500`, `chunkOverlap: 150`, `separators: ['. ', '? ', '! ', ' ']`, call `await splitter.splitText(text)`

### Unit Tests
- [ ] Write `chunking-utils.test.js` importing `stripNoise` from the script
- [ ] `stripNoise`: removes `[music]` (case-insensitive), `[Applause]`, `>>` markers, preserves surrounding recipe content
- [ ] `stripNoise`: empty string input → empty string
- [ ] Smoke test: instantiate `RecursiveCharacterTextSplitter` with production config, call `splitText` on the Honey Miso transcript text (7,721 chars) inlined as a fixture — expect 6 chunks
- [ ] Run `npm test` — all tests pass

### Chunking Script — Core
- [ ] Add `CHAR_THRESHOLD = 5000`, `CHUNK_SIZE = 1500`, `CHUNK_OVERLAP = 150`, `SEPARATORS` constants
- [ ] Add MAP_PROMPT (verbatim from `test-map-prompt.js`)
- [ ] Add REDUCE_PROMPT (verbatim from `test-reduce-prompt.js`)
- [ ] Implement `callGemini(prompt)` — fetch to Gemini 2.5 Flash, `thinkingBudget: 0` (offline processing), strips code fences, returns text
- [ ] Implement `mapChunk(chunkText)` — calls `callGemini(MAP_PROMPT + chunkText)`, JSON.parses result, returns `{ ingredients, steps }` or `null` on parse failure
- [ ] Implement `reduceChunks(mapResults)` — calls `callGemini(REDUCE_PROMPT + JSON.stringify(mapResults))`, returns raw text string

### Chunking Script — Main Loop
- [ ] Parse CLI args: `--dry-run`, `--recipe-id <uuid>`, `--limit <n>`
- [ ] Fetch recipes: `transcript IS NOT NULL AND transcript_chunked_at IS NULL` (filtered by `--recipe-id` if provided)
- [ ] For each recipe: skip if `transcript.length <= CHAR_THRESHOLD` — log "skipped (short)"
- [ ] For each long recipe: run `stripNoise` → `rcts` → log chunk count
- [ ] Map phase: `await Promise.all(chunks.map(c => mapChunk(c)))` — log per-chunk result (pass/null)
- [ ] Reduce phase: `await reduceChunks(mapResults.filter(Boolean))` — if throws, log error and continue to next recipe (do NOT set `transcript_chunked_at`)
- [ ] Build chunk records: `chunks.map((text, i) => ({ text, summary: mapResults[i] ?? null }))`
- [ ] Supabase UPDATE: `transcript_chunks`, `transcript_summary`, `transcript_chunked_at = new Date().toISOString()`
- [ ] `--dry-run`: log what would happen, skip all DB writes and Gemini calls
- [ ] Log timing per recipe (map ms, reduce ms, total ms)

### End-to-End Verification
- [ ] Dry run: `node --env-file=.env scripts/chunk-transcripts.js --dry-run` — lists Honey Miso, Buffalo Wings, Breakfast as "would chunk"; all short videos as "would skip"
- [ ] Single recipe: run against Honey Miso — verify in Supabase that `transcript_chunks` has 6 objects each with `text` and `summary`, `transcript_summary` is non-null, `transcript_chunked_at` is set
- [ ] Re-run against Honey Miso — verify it is skipped (already chunked)
- [ ] Full run: run against all recipes — Buffalo Wings and Breakfast also chunked, all short videos skipped
- [ ] Check: no recipe has `transcript_chunked_at` set but `transcript_summary` null (would indicate reduce failed silently)
