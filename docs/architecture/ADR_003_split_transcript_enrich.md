# ADR 003: Split Transcript Retrieval and Ingredient Enrichment into Dedicated Pipeline Stages

**Status:** Proposed
**Date:** 2026-03-24
**Deciders:** Solo Developer
**Related Documents:**
- [ADR 002: Dual Authentication for YouTube OAuth](./ADR_002_dual_auth_oauth.md)
- [PRD 001: RecipeLoop MVP](../planning/PRD001_recipeloop.md)
- [User Journey 001: YouTube Auth](../planning/UJ001_yt_auth.md)

---

## Context

### Problem Statement

`playlist-enrich-processor.js` currently performs two distinct, expensive operations inside a single Netlify function invocation:

1. **Transcript fetch** — a sequential HTTP call per video to `https://transcript-microservice.fly.dev/transcript?video_id={id}`, network-bound and externally rate-limited
2. **Ingredient extraction** — a Gemini API call with the transcript text, LLM-bound and independently retryable

With Netlify's 10s default timeout (26s on Pro), a batch of 5 recipes each needing both a transcript fetch (~3-5s) and a Gemini call (~5-7s) can easily exceed the function window. When it does, both operations fail atomically — transcripts successfully fetched in the same invocation as a failed Gemini call are lost and must be re-fetched.

The two operations also have different failure modes and retry costs:
- **Transcript failures** are caused by YouTube rate limiting, cloud IP blocks, or unavailable captions. They are expensive to retry and consume external rate limit budget.
- **Gemini failures** are caused by API quotas or JSON parse errors. They are cheap to retry once a transcript is already stored.

Today `playlist-enrich-finder.js` returns recipes missing a transcript OR ingredients, and the processor handles both in one pass. This means a recipe with a cached transcript still enters the transcript-phase code path, and any combined failure can reset progress for a recipe that only needed one thing done.

### Current Architecture

```
Frontend (PlaylistDiscoveryPage)
    |
    | POST /playlist-sync
    v
playlist-sync.js  (fetch YouTube API, upsert recipes — no transcript, no ingredients)
    |
    | (user clicks "Enrich")
    v
playlist-enrich.js  [ORCHESTRATOR]
    |---> playlist-enrich-finder.js  (find recipes missing transcript OR ingredients)
    |---> [loop] playlist-enrich-processor.js  (fetch transcript + call Gemini, batch of 5)
              |---> transcript-microservice.fly.dev  (1 HTTP call per video, sequential)
              |---> Gemini API  (1 LLM call per recipe)
              |---> Supabase recipes table  (upsert transcript + ingredients)
```

### Research Findings

- **Netlify timeout pressure:** 5 recipes each needing transcript (~4s avg) + Gemini (~6s avg) = ~50s sequential work against a 26s Pro timeout. The current `max_batch_size: 5` was chosen empirically and is frequently unsafe.
- **No batch transcript API:** `transcript-microservice.fly.dev` has no batch endpoint. Every video requires a separate HTTP call. This is the dominant time cost in the current processor.
- **YouTube IP-rate limiting:** Sequential transcript requests are safer than parallel. Cloud provider IPs (AWS, GCP, fly.dev) are frequently blocked by YouTube at ~250 requests. Parallel calls from a single function invocation accelerate hit rate.
- **Transcript reuse value:** Once stored, a transcript enables Gemini extraction with zero external HTTP calls. A Gemini-only function can complete a batch of 5-7 recipes in ~5-8s, well within the 10s default timeout.
- **Existing orphaned split:** `transcript-fill.js` and `enrich.js` are legacy functions that already implement this separation — they were the original architecture before the Phase 2.3 combined processor was introduced. This ADR formalises the original intent into the active pipeline.

---

## Decision

Split `playlist-enrich-processor.js` into two dedicated, single-responsibility functions. Orchestrate the 3-step pipeline using **frontend-driven sequential orchestration** — the frontend calls each phase separately and manages batch pagination per phase, extending the pattern already used for enrich batching.

### Architecture

```
Frontend (PlaylistDiscoveryPage)
    |
    |  STEP 1: Sync (unchanged)
    | POST /playlist-sync
    v
playlist-sync.js
    (upserts recipes with video metadata only — no transcript, no ingredients)

    |
    |  STEP 2: Transcript Phase
    |  frontend calls finder (phase: 'transcript') → gets recipe_ids[]
    |  while has_more:
    |    POST /playlist-transcript-processor { recipe_ids, max_batch_size: 3 }
    v
playlist-transcript-processor.js  [NEW]
    |---> transcript-microservice.fly.dev  (1 HTTP call per video, sequential)
    |---> Supabase recipes.transcript  (upsert after each success)
    |
    | returns: { processed, successful, errors, remaining_recipe_ids, has_more }

    |
    |  STEP 3: Enrich Phase
    |  frontend calls finder (phase: 'ingredients') → gets recipe_ids[]
    |  while has_more:
    |    POST /playlist-enrich-processor { recipe_ids, max_batch_size: 5 }
    v
playlist-enrich-processor.js  [MODIFIED — transcript assumed present]
    |---> Supabase recipes (SELECT transcript WHERE id IN batch)
    |---> Gemini API  (1 LLM call per recipe with stored transcript)
    |---> Supabase recipes.ingredients  (upsert per recipe)
    |
    | returns: { processed, successful_ingredients, errors, remaining_recipe_ids, has_more }
```

---

## Implementation Components

### New Functions

**`netlify/functions/playlist-transcript-processor.js`**
- Accepts `{ recipe_ids: string[], max_batch_size?: number }` — default batch size **3**
- For each recipe in batch: parse `video_id` from `video_url`, fetch transcript from microservice, store to `recipes.transcript`
- 3 sequential HTTP calls at ~3-5s each = ~9-15s; fits in 26s Pro timeout with headroom
- Returns `{ processed, successful, errors, remaining_recipe_ids, has_more }`
- Does NOT call Gemini

### Modified Functions

**`netlify/functions/playlist-enrich-processor.js`**
- Remove all transcript-fetch logic (the `needsTranscript` block and `TRANSCRIPT_API_URL` constant)
- If `transcript` is null/empty for a recipe in the batch, skip it and surface as an error (not a silent pass-through)
- Gemini call and ingredient storage logic unchanged
- Can safely increase `max_batch_size` to **5-7** — no network calls, one Gemini call per recipe

**`netlify/functions/playlist-enrich-finder.js`**
- Add a `phase` parameter:
  - `'transcript'` → recipes where `transcript IS NULL`
  - `'ingredients'` → recipes where `transcript IS NOT NULL AND (ingredients IS NULL OR ingredients = '[]')`
  - (default: current behaviour — recipes missing either)
- This allows the frontend to get the correct work queue per phase independently

### Deprecated (not deleted immediately)

**`netlify/functions/playlist-enrich.js`** — server-side orchestrator replaced by frontend-driven pagination. Mark with a deprecation comment; remove after frontend is confirmed working.

**`netlify/functions/transcript-fill.js`** and **`netlify/functions/enrich.js`** — orphaned legacy functions, no action needed.

### Frontend

**`src/pages/PlaylistDiscoveryPage.jsx`** (or new `ProcessingPage.jsx`)
- Replace single "Enrich" button with a 3-step progress UI: Sync → Transcript → Enrich
- Each step tracks its own progress state: `{ phase, batchesCompleted, totalBatches, errors[] }`
- Transcript phase loop runs to completion before enrich phase begins

---

## Consequences

### Positive

- **Timeout safety:** Transcript batches of 3 (sequential HTTP) fit comfortably in the 26s Pro window. Enrich batches of 5-7 (Gemini only) fit in the 10s default window.
- **Partial progress preserved:** If a transcript batch partially succeeds, those transcripts are committed to the DB. The next batch call picks up from `remaining_recipe_ids`. No silent rollback of completed work.
- **Independent retryability:** A Gemini failure does not trigger a transcript re-fetch. A transcript failure does not block ingredient extraction for recipes that already have transcripts.
- **Clearer observability:** Function logs for `playlist-transcript-processor` show only transcript timing; logs for `playlist-enrich-processor` show only Gemini timing. Bottlenecks are immediately visible.
- **Rate limit isolation:** YouTube/transcript IP-block errors surface only in transcript logs. Gemini quota errors surface only in enrich logs.

### Negative

- **Frontend complexity increases:** Two sequential looping phases instead of one. Progress state becomes more complex (two `remaining_recipe_ids` queues, two progress bars, two error surfaces).
- **More function files:** Three active processor functions instead of one combined processor.
- **Intermediate DB state is normal:** Recipes with `transcript IS NOT NULL AND ingredients IS NULL` are now expected persistent state, not an anomaly. Any queries or UI treating this as an error will need updating.
- **User-visible latency unchanged:** Total wall-clock time does not decrease — the work is the same. The split improves reliability, not throughput.

### Neutral

- `playlist-enrich.js` becomes dead code but is not immediately harmful.
- `max_batch_size` defaults change per phase (3 for transcript, 5-7 for enrich). Config change only, not a behaviour change.
- The `playlist-enrich-finder.js` `phase` parameter is additive — no existing callers break if it defaults to the current behaviour.

---

## Alternatives Considered

### Option A: Reduce Batch Size in Current Combined Processor

Reduce `max_batch_size` from 5 to 1-2 to stay within timeout.

**Pros:** Zero new files, zero frontend changes.
**Cons:** 1 recipe at `transcript (~5s) + gemini (~7s) = 12s` still times out on the 10s default tier. A single slow transcript fetch (rate-limit back-off, fly.dev cold start) blows the budget for any batch size. Defers the problem, does not solve it.

**Verdict: Rejected.** Does not address the timeout root cause.

---

### Option B: Netlify Background Functions

Configure the processor as a Netlify Background Function (async, up to 15 minutes).

**Pros:** No timeout pressure at all; could handle large playlists in a single invocation.
**Cons:** Not configured in `netlify.toml`. Background functions do not return a response body — the frontend cannot show progress without a polling mechanism (requires a `job_status` table or Supabase Realtime). Adds significant complexity for a solo MVP developer. Silent mid-run failures have no `remaining_recipe_ids` to resume from.

**Verdict: Rejected for MVP.** Viable for a future phase if playlist sizes grow beyond ~50 videos.

---

### Option C: Extend Existing `playlist-enrich.js` Orchestrator

Update `playlist-enrich.js` to run `finder → transcript loop → enrich loop` as a single server-side entry point.

**Pros:** Single frontend call; orchestration stays server-side.
**Cons:** The orchestrator already has a timeout problem — its inner while-loop with 2s inter-batch delays cannot run 20+ videos through two phases within any Netlify synchronous function timeout. Adds a server-side loop that is architecturally unsound on synchronous functions. Hides per-phase progress from the frontend.

**Verdict: Rejected.** Extends a flawed pattern rather than replacing it.

---

### Option D: New Pipeline Orchestrator `playlist-process.js`

A new entry point that encapsulates finder + transcript-processor + enrich-processor.

**Pros:** Clean slate; single new function name.
**Cons:** Same timeout problem as Option C if synchronous. Extra indirection with no benefit over frontend-driven orchestration at MVP scale. The phased sequence is clearer as explicit frontend calls than as an opaque server-side orchestration chain.

**Verdict: Not recommended for MVP.**

---

## Orchestration: Why Frontend-Driven

The project already uses frontend-driven batch pagination — `PlaylistDiscoveryPage.jsx` holds `remaining_recipe_ids` and calls the processor in a loop. Extending this to a transcript phase adds one extra loop on the frontend, not a new server-side concept.

Server-side orchestrators (Options C and D) fail on a hard constraint: Netlify synchronous functions cannot run a while-loop across 20+ videos without timing out. The current `playlist-enrich.js` exhibits this exact problem and is only safe for very small playlists. Replacing it with another orchestrator does not fix the constraint — it recreates the same problem at a higher level.

The correct resolution for an MVP is to keep individual functions short-lived and push sequencing to the client, where there is no timeout. If the project scales and background functions become necessary, the frontend-driven loops can be replaced by a background pipeline orchestrator at that point without changing the underlying function contracts.

---

## Notes

- `max_batch_size` values (3 for transcript, 5 for enrich) are starting points. Tune based on Netlify logs after initial deployment. Transcript microservice response time varies significantly with video length and YouTube captions API latency.
- If on the Netlify free tier (10s timeout), reduce transcript `max_batch_size` to **1** until Pro is confirmed.
- `recipes.transcript` stores the full transcript — no character cap is applied.
- If a recipe has no captions available (YouTube returns empty transcript), the transcript processor should store a sentinel value (e.g. empty string + a `transcript_unavailable` flag, or `"NO_TRANSCRIPT"`) rather than leaving `transcript` as `null`. This prevents the finder from repeatedly re-queuing videos that will never have captions.
- The orphaned `enrich.js` and `transcript-fill.js` use the anon-key Supabase client (`src/lib/supabaseClient.js`). The active pipeline uses the service role key. Do not merge their patterns into the new functions.
