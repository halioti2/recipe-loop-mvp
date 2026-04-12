# Bug Videos — Known Enrichment Issues

**Status:** Living Document
**Date:** 2026-04-11
**Purpose:** Track videos with known enrichment failures or data quality issues. Used to inform the `enrich_skip` / `enrich_attempt_count` fix and to avoid wasting enrichment cycles on permanently broken videos.

---

## Videos

### Bibimbap Was Never Meant to Be Fancy 😳🍚
**YouTube:** https://www.youtube.com/watch?v=-Hkzj9QFkrc
**Video ID:** `-Hkzj9QFkrc`
**DB Status:** Deleted from Supabase (2026-04-11)

**Issue: Garbled transcript**
Supadata returns HTTP 200 with 17 segments / 652 chars, but the auto-caption quality is too poor to be useful. The key dish name "bibimbap" is transcribed as "pee and pop", "pebb and pop", and "pean pop" throughout. A chat assistant trained on this transcript would not reliably answer questions about the recipe.

**Full transcript from Supadata (17 segments, 652 chars):**
> "Wait, did you know that pee and pop is a dish that are made out of leftovers? I constantly see overpriced pebb and pop in Korean restaurants overseas and I get so frustrated because pean pop originates from leftover side dishes that has been sitting around in the fridge, but it's too wasteful to throw them away. So, us Koreans decided to pour everything together in a huge bowl. Add some warm rice, add spoonful of kouang and some sesame oil. And it somehow became this delicious complete meal that everyone knows about now. So, that's exactly what I made today. I just reheated and steamed all the side dishes and made myself a good old peeping bub."

Mistranscriptions: `bibimbap` → "pee and pop" / "pebb and pop" / "pean pop" / "peeping bub". `gochujang` → "kouang".

**Root cause:** YouTube auto-captions failed to recognise a non-English dish name. No manual captions available on this video.

**Secondary issue: Recipe content is incomplete**
Even if the transcript were correctly transcribed, the video does not present a usable recipe. The creator describes bibimbap conceptually ("leftover side dishes", "warm rice") without listing actual ingredients or quantities. The only specific ingredients mentioned are gochujang ("kouang") and sesame oil, both referenced at the end as seasonings. A chat assistant grounded in this transcript could not answer basic questions like "what vegetables go in this?" or "how much rice do I need?"

**Resolution:** Removed from library. If re-added, would need manual transcript correction or a different source video. Note: user indicated there may be a second video of this recipe with the same issue ("2 vids").

---

### Sheet Pan Chicken Kefta 🔥
**YouTube:** https://www.youtube.com/watch?v=uWoB0_3wSrY
**Video ID:** `uWoB0_3wSrY`
**DB Status:** In DB — `transcript: NULL`, `ingredients: NULL`

**Issue: Transcript permanently unavailable**
Supadata returns HTTP 206 with `transcript-unavailable`:
```json
{ "error": "transcript-unavailable", "message": "No transcript is available for this video" }
```
This is not a transient failure — the video has no captions of any kind available. Re-running enrichment will always produce the same result.

**Root cause:** Video has no YouTube captions (auto or manual). The title also notes "Full recipe pinned in the comment section" — the creator published the recipe as a comment rather than narrating it in the video, so there is no transcript-extractable content.

**Current behaviour:** Picked up by `playlist-enrich-finder` on every enrichment run (transcript is null), processor calls Supadata, Supadata returns 206, transcript stays null, loop repeats. Wastes a Supadata API call each run.

**Resolution:** Set `enrich_skip = true` once that column exists. Until then, manually exclude from enrichment runs. No transcript or chat support possible for this video.

---

## Patterns

| Video | Supadata status | Issue type | Resolution |
|-------|----------------|------------|------------|
| Bibimbap | 200 (garbled) | Poor auto-caption quality | Removed from library |
| Sheet Pan Chicken Kefta | 206 (unavailable) | No captions on video | `enrich_skip` flag needed |

---

## Related

- `enrich_skip` / `enrich_attempt_count` fix tracked in enrichment pipeline — see `playlist-enrich-finder.js` and `playlist-enrich-processor.js`
- Crème this brûlée (`Q0xGQTv31Jk`) has a stored transcript but Supadata now returns no segments — video may have gone private. Not causing enrichment loop issues (transcript is stored) but timestamp-aware chunking (Phase 2) will not be possible.
