# Chunking Strategy Comparison

**Status:** Research Complete
**Date:** 2026-04-10
**Purpose:** Compare all viable chunking strategies for recipe video transcripts, covering how each works, how it handles timestamps, and how it behaves on transcripts with and without punctuation.

---

## Context

Supadata returns a transcript as an array of segments: `{ offset: ms, duration: ms, text: string }`. Our enrich pipeline currently joins them into a single string with `.map(c => c.text).join(' ')`, discarding the timestamps. Any strategy that needs timestamps must work from the raw Supadata segments, not the stored string.

The three videos that require chunking in our current library:
- Honey Miso Short Rib — 8:43, ~1,930 tokens, good punctuation (157 periods)
- How I Stopped Cooking Breakfast — 6:22, ~1,922 tokens, good punctuation
- Buffalo Wings — 17:20, ~3,855 tokens, good punctuation

No-punctuation videos are exclusively Shorts (e.g. "There is no better meal than this one", "Everyone should know how to make this classic") — all under 1,000 chars (~250 tokens), well below the 1,500-token chunking threshold. They will never be chunked.

---

## Strategy 1 — RecursiveCharacterTextSplitter

### How it works
Splits the stored transcript string by character count using a configurable separator list, trying each in order until chunks are within `chunk_size`. The separator list is fully customisable — for recipe transcripts it should be set to prioritise sentence-ending punctuation rather than the default paragraph/line-break chain. Adds `chunk_overlap` characters of shared content between consecutive chunks.

```js
const splitter = new RecursiveCharacterTextSplitter({
  separators: [". ", "? ", "! ", " ", ""],
  chunkSize: 1500,
  chunkOverlap: 150,
  keepSeparator: true,
});
```

```
Full transcript string (joined, no timestamps)
  → Try split on sentence endings (". ", "? ", "! ") first
  → If still too big, try spaces (words)
  → Add overlap between chunks
```

### Example on Buffalo Wings (~500 chars per chunk)
```
Chunk 1: "Now, I don't want to say that every single Chinese person hates buffalo
          wings. I mean, sixth of humanity. I'm sure you could find somebody."
          ↑ cuts cleanly at sentence end
Chunk 2: "...I'm sure you could find somebody. But in a decade and a half of living
          here in China, every single Chinese friend that I tried to introduce them to…"
          ↑ overlap region starts at nearest sentence boundary
```

### On transcripts without punctuation (Shorts — not chunked in practice)
Falls through to splitting on spaces — every chunk is exactly `chunk_size` characters of words. No sentence awareness at all. Output looks like:
```
Chunk 1: "hey guys today we are making the best chicken ever you need"
Chunk 2: "to season it really well and then you put it in the oven"
```
Note: all no-punctuation videos in the current library are Shorts under 250 tokens — they never reach the 1,500-token chunking threshold, so this fallback path is never triggered in practice.

### Assessment
| Property | Result |
|----------|--------|
| Timestamps preserved | ✗ Not by default — the pipeline's join step (`.map(c => c.text).join(' ')`) discards Supadata `offset` values before RCTS runs. This is a preprocessing limitation, not an RCTS limitation. Timestamps can be preserved by embedding offsets into the joined string (`[${c.offset}] text`) before splitting — RCTS won't split on bracket markers — then parsing first/last marker per chunk to recover `start_ms`/`end_ms`. This adds pre/post-processing steps and is deferred to Phase 2. |
| Handles no-punctuation | ✓ Degrades gracefully to word splits |
| Mid-sentence cuts | ✓ Avoided when separators are configured punctuation-first (`". "`, `"? "`, `"! "`) — falls back to spaces only when no sentence boundary exists within `chunkSize` |
| Implementation | Simple — one LangChain import, custom separator config |
| Timestamp playback possible | ✗ Not in Phase 1. ✓ Achievable in Phase 2 via embedded offset encoding (see above). |

---

## Strategy 2 — Fixed Time Windows (Hard Cuts)

### How it works
Groups Supadata segments into fixed-duration buckets (e.g. every 60 seconds) based on their `offset` value. Hard boundary at each minute mark regardless of where the sentence ends.

```
Segments with offset 0–59,999ms   → Chunk 1
Segments with offset 60,000–119,999ms → Chunk 2
...
```

### Example on Honey Miso at 1:00 boundary
```
Chunk 1 ends: "...the bone. it'll add to that broth. But I don't know. I just like having more"
Chunk 2 starts: "surface area to sear up that's actually [music] meat. It's just simpler..."
```
Sentence split mid-phrase.

### Real data result
86% of minute boundaries produced awkward cuts across all 20 recipes (31 of 36 boundaries tested — see `RE_transcript_boundary_analysis.md`).

### Assessment
| Property | Result |
|----------|--------|
| Timestamps preserved | ✓ Yes — each chunk has exact `start_ms` and `end_ms` |
| Handles no-punctuation | ✓ Yes — doesn't rely on punctuation |
| Mid-sentence cuts | ✗ 86% of cuts are mid-sentence |
| Implementation | Simple |
| Timestamp playback possible | ✓ Yes |

---

## Strategy 3 — Punctuation-Only Split (Sentence Boundary)

### How it works
Joins Supadata segments and splits on sentence-ending punctuation (`.`, `?`, `!`). Groups sentences until a target token count is reached, then starts a new chunk.

```
Full transcript
  → Split on ". " / "? " / "! "
  → Group sentences until ~300 tokens
  → New chunk when threshold hit
```

### On transcripts without punctuation (Shorts — not chunked in practice)
Falls apart completely — no split points exist. The entire transcript becomes one chunk, defeating the purpose. Not a real concern: all no-punctuation videos in the library are well under the chunking threshold.

### Assessment
| Property | Result |
|----------|--------|
| Timestamps preserved | ✗ No — works on stored string |
| Handles no-punctuation | ✗ Fails — produces one giant chunk |
| Mid-sentence cuts | ✓ Never cuts mid-sentence |
| Implementation | Simple |
| Timestamp playback possible | ✗ No |

---

## Strategy 4 — Hybrid: Time Window + Punctuation Snap *(Recommended)*

### How it works
Combines the timestamp awareness of Strategy 2 with sentence-boundary respect. Groups segments into time windows, then instead of cutting hard at the boundary, scans forward/backward for the nearest sentence-ending punctuation and snaps to that instead.

```
For each 60-second window boundary:
  1. Identify the last segment before the boundary
  2. Scan backward through recent segments for ". " or "? " or "! "
  3. If found within a tolerance (e.g. ±15 seconds): snap cut to that point
  4. If not found (no punctuation): fall back to hard time cut
  5. Record start_ms and end_ms for each chunk
```

### Example on Honey Miso at 1:00 boundary
Hard cut at 1:00:
```
..."I just like having more / surface area to sear up..."  ✗ mid-sentence
```
With punctuation snap (scans back to nearest `.`):
```
..."it'll add to that broth. But I don't know." ← snap here  ✓ clean cut
"I just like having more surface area to sear up..."  ← next chunk starts here
```
Honey Miso has 157 periods in its transcript — punctuation snapping works well here.

### On transcripts without punctuation (Shorts — not chunked in practice)
No punctuation found within tolerance → falls back to hard time cut. Since all no-punctuation videos are Shorts under the chunking threshold, this fallback never fires in practice. All three videos that actually require chunking (Honey Miso, Breakfast, Buffalo Wings) have good punctuation.

### Assessment
| Property | Result |
|----------|--------|
| Timestamps preserved | ✓ Yes — each chunk has `start_ms` and `end_ms` |
| Handles no-punctuation | ✓ Graceful fallback to hard time cut |
| Mid-sentence cuts | ✓ Avoided when punctuation exists, rare fallback when not |
| Implementation | Moderate — requires segment-level processing |
| Timestamp playback possible | ✓ Yes |

---

## Strategy 5 — Semantic Chunking

### How it works
Generates an embedding for every sentence, then calculates similarity scores between adjacent sentences. Splits where similarity drops significantly — indicating a topic shift.

```
Sentence 1 embedding → similarity to sentence 2
Sentence 2 embedding → similarity to sentence 3
...
Split where similarity drops below threshold
```

### Assessment
| Property | Result |
|----------|--------|
| Timestamps preserved | ✗ No — works on text only |
| Handles no-punctuation | ✗ Requires sentences to embed |
| Mid-sentence cuts | ✓ Never — splits on topic shifts |
| Implementation | Complex + expensive (embed every sentence) |
| Timestamp playback possible | ✗ No without extra engineering |
| JS support | ⚠️ Limited — primarily a Python LangChain feature |

---

## Side-by-Side Comparison

| | Recursive Character | Fixed Time | Punctuation Only | **Hybrid (Recommended)** | Semantic |
|---|---|---|---|---|---|
| Timestamps | ✗ Phase 1 / ✓ Phase 2¹ | ✓ | ✗ | ✓ | ✗ |
| Clean cuts | ✓ (punctuation-first separators) | 14% | ✓ | ✓ (with fallback) | ✓ |
| No-punctuation | ✓ | ✓ | ✗ | ✓ fallback | ✗ |
| Timestamp playback | ✗ | ✓ | ✗ | ✓ | ✗ |
| Complexity | Low | Low | Low | Medium | High |
| JS support | ✓ | ✓ | ✓ | ✓ | ⚠️ |
| Cost | Low | Low | Low | Low | High (embeddings) |

¹ RCTS timestamp limitation is a preprocessing constraint, not an RCTS limitation. The pipeline join step discards Supadata `offset` values before RCTS runs. Recoverable in Phase 2 by embedding offsets into the string pre-join and parsing them back out post-split.

---

## Recommendation

**Phase 1 — RecursiveCharacterTextSplitter (Strategy 1)** with punctuation-first separators. Simpler to implement and sufficient for the immediate goal: accurate chat on long videos. Timestamps are not required for Phase 1 and are deferred.

**Phase 2 — Hybrid (Strategy 4)** when timestamp playback is built. RCTS loses Supadata `offset` values at the join step (a preprocessing constraint, not an RCTS limitation — see Strategy 1 assessment). The Hybrid approach preserves timestamps natively and still produces clean sentence-boundary cuts via punctuation snapping.

**Note on no-punctuation fallback:** Honey Miso Short Rib was originally misidentified as having no punctuation — it has 157 periods. All no-punctuation videos in the current library are Shorts well below the 5,000 char chunking threshold and will never be chunked. The fallback path in both strategies is future-proofing only.

**Snap tolerance (Phase 2):** ±15 seconds is the starting point. Tighter = more consistent chunk durations. Looser = cleaner sentence boundaries. Tune once real chunk quality is observed.
