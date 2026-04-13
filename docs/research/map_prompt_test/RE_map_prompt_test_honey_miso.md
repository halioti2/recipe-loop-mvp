# Map Prompt Test Results — Honey Miso Short Rib

**Status:** Research Complete
**Date:** 2026-04-12
**Purpose:** Evaluate the OQ5 candidate map prompt against all 6 RCTS demo chunks from Honey Miso Short Rib. Determine whether the prompt correctly filters filler and what the output reveals about the reduce phase requirements.

---

## TL;DR

- **Problem:** OQ5 asks whether the candidate map prompt filters filler chunks (Chunk 4: narrative, Chunk 6: outro) while producing useful output on content-rich chunks. Needed real Gemini output to assess quality before implementing the full pipeline.
- **Current:** Map prompt candidate from OQ5 — "Extract only the ingredients with quantities and cooking steps from this section. If no recipe content is present, return nothing."
- **Finding:** The prompt correctly ignores narrative and outro filler but **no chunk returned empty**. The overlap design means every chunk has real recipe content at its edges, even chunks that are mostly filler. The "return nothing" path was never triggered.
- **Decision:** Prompt filters content correctly — approve for Phase 1. Two follow-on changes needed before wiring up the full pipeline: (1) force consistent output format to make the reduce phase reliable, (2) define the reduce prompt to handle deduplication.

---

## Test Setup

**Script:** `scripts/test-map-prompt.js`
**Model:** gemini-2.5-flash, `thinkingBudget: 0`
**Chunks:** 6 chunks from `RE_rcts_demo_honey_miso.md` — unstripped (contain `[music]` noise)
**Execution:** All 6 fired in parallel via `Promise.all`
**Total time:** 1,302ms

---

## Results by Chunk

| # | Note | Result | Expected | Verdict |
|---|------|--------|----------|---------|
| 1 | Seasoning + start of sear | Ingredients + 2 steps | Useful output | ✅ Pass |
| 2 | Sear continues + veg prep | Ingredients + steps | Useful output | ✅ Pass |
| 3 | Sauce ingredients added | Full ingredient list + steps | Dense output | ✅ Pass |
| 4 | Filler — cook reflects on luxuriousness | Oven step + remove ribs + reduce sauce | **Empty** | ❌ Expectation wrong — see below |
| 5 | Sauce reduction + cornstarch | Straining steps + slurry | Useful output | ✅ Pass |
| 6 | Outro — plating + sign-off | Plating steps, sign-off ignored | **Near-empty** | ❌ Expectation wrong — see below |

---

## Chunk-by-Chunk Analysis

### Chunk 1 — Seasoning + Start of Sear

```
Ingredients:
  Green onion, Garlic, Ginger, Star (likely star anise), 1 shallot,
  Salt, Black pepper, Short ribs, Neutral oil (avocado)

Steps:
  Season short ribs with salt and pepper.
  Sear seasoned short ribs in a pot with neutral oil.
```

Clean. The model annotated "star (likely star anise)" — correctly inferring an ambiguous word from transcript context. No quantities beyond "1 shallot" because the transcript provides none; the model didn't hallucinate. `[music]` noise was ignored entirely.

---

### Chunk 2 — Sear Continues + Veg Prep

```
Ingredients:
  Neutral oil (avocado), Short ribs, Ginger (sliced),
  Garlic (crushed), Green onions (rough chop, reserve for garnish),
  Shallot (outer skin removed)

Steps:
  Sear short ribs until browned, in batches if needed.
  Slice ginger, crush garlic, rough chop green onions and shallot.
```

Overlap region carried neutral oil and short ribs forward from Chunk 1 — minor cross-chunk redundancy as expected. Prep notes (sliced, crushed, rough chop) correctly extracted. Garnish note ("reserve some for later") preserved.

---

### Chunk 3 — Sauce Ingredients (Most Content-Rich)

```
  Green onions, shallots, garlic, ginger → into pot
  Short ribs → browned, set aside
  Mirin → deglaze
  Miso → add, cook down
  Soy sauce → hefty amount
  Dark soy sauce → add
  Honey, two star anise → add, stir
  Short ribs → add back in
  Broth → add, cook for a couple of hours
```

Best output of the six. All sauce build ingredients captured in sequence. "Two star anise" correct (Chunk 1 only had "star"). No quantities where the transcript doesn't provide them (miso, soy, dark soy) — honest reflection of the source.

**This is the chunk the reduce phase most depends on.** The full sauce ingredient list lives here and only here.

---

### Chunk 4 — Expected Empty, Got Useful Steps

The chunk is predominantly the cook reflecting on short ribs being "luxurious" and "a good fat mouth fill" — pure narrative with no recipe value.

```
Ingredients:
  Short rib (quantity unspecified)
  Broth (quantity unspecified)

Steps:
  Add short rib back in and add broth.
  Cook for a couple of hours in the oven with the lid on.
  Remove short ribs when tender.
  Cook down the sauce to create a thick glaze.
```

**Why it didn't return empty:** The overlap region at the start of Chunk 4 carried over the final recipe step from Chunk 3 — "add short rib back in, add broth, let this cook for a couple of hours." The tail end of the chunk ("I just checked our short ribs, they are tender, take them out, cook down the sauce") is also real recipe content.

The middle of the chunk — the luxurious/date-night monologue — was **correctly filtered**. The map prompt did exactly what it was supposed to do. The expectation that the chunk would return empty was wrong; the overlap and boundary transitions mean real recipe content is always present at chunk edges.

**Revised conclusion for OQ5:** The goal "return nothing for filler" is unachievable by design — overlap ensures every chunk has some recipe-adjacent content. The correct goal is "extract only what's there, ignore narrative." The prompt achieves that.

---

### Chunk 5 — Sauce Reduction + Cornstarch

```
  Short ribs → removed from pot
  Vegetables, ginger → strained from broth
  Broth → returned to pot, reduced
  Cornstarch slurry → added once boiling, for thickness
```

Clean and accurate. The reduction and thickening steps are correctly sequenced. No extraneous content.

---

### Chunk 6 — Expected Near-Empty, Got Plating Steps

```
  Cornstarch
  Add short rib back to sauce and coat
  Plate two per person in center
  Pour extra sauce over the top
  Garnish with green onions
```

The sign-off ("Don't forget guys, like, comment, share, and subscribe") was **correctly ignored**. The chunk also contains real plating steps before the sign-off — coating ribs in the thickened sauce, plating, garnishing. These are valid recipe content.

Chunk 6 is not an outro-only chunk; it's plating steps followed by an outro. The prompt correctly extracted the recipe content and dropped the sign-off.

---

## Key Finding: Inconsistent Output Format

Every chunk returned a different format:

| Chunk | Format used |
|-------|-------------|
| 1 | Asterisk bullets, **bold** section header |
| 2 | Bold inline labels + asterisk bullets |
| 3 | Plain asterisk bullets, inline `→` arrows |
| 4 | Bold `**Ingredients:**` / `**Cooking Steps:**` header with nested bullets |
| 5 | Bold inline labels + asterisk bullets |
| 6 | Plain dash bullets |

**This is a blocking issue for the reduce phase.** If the reduce call receives 6 summaries in 6 different formats, it must parse structure it cannot reliably infer. The reduce prompt would need to normalise format before consolidating — an unnecessary burden.

The fix is to constrain the map prompt to a consistent machine-readable output. See recommendation below.

---

## Data Flow: Expected vs Actual

```
Expected:
  Chunk 4 (filler) → map prompt → (empty — nothing extracted)
  Chunk 6 (outro)  → map prompt → (empty — nothing extracted)

Actual:
  Chunk 4 (filler) → map prompt → [oven step, remove ribs, reduce sauce]
  Chunk 6 (outro)  → map prompt → [plate ribs, sauce, garnish] (sign-off dropped)

Why:
  Overlap region (150 chars) carries real recipe steps from adjacent chunks
  into every chunk. Even a "filler" chunk has a step transition at its start
  and often another at its end. The map prompt filters the narrative correctly
  but cannot return empty because recipe content is always present at chunk edges.
```

---

## Problem vs Solution

| Issue | Current Prompt Behaviour | Fix Required |
|-------|--------------------------|-------------|
| Narrative filler | ✅ Correctly ignored | None |
| Outro/sign-off | ✅ Correctly ignored | None |
| `[music]` noise | ✅ Correctly ignored | None |
| "Return nothing" for filler chunks | ❌ Never triggered — overlap prevents it | Drop this requirement. Correct goal: extract what's there, ignore filler. |
| Inconsistent output format | ❌ 6 different formats across 6 chunks | Add explicit format constraint to map prompt |
| Cross-chunk ingredient duplication | ⚠️ Present (neutral oil, short ribs in C1 and C2) | Reduce prompt must deduplicate |

---

## Side-by-Side: Current vs Recommended Map Prompt

### Current (approved for filtering, needs format fix)

```
Extract only the ingredients with quantities and cooking steps from
this section of a recipe video transcript. Format as a short bulleted
list. If no recipe content is present in this section, return nothing.

Transcript section:
[chunk text]
```

**Problem:** "Format as a short bulleted list" produces inconsistent markdown. "Return nothing" is never triggered and creates a false expectation in the reduce phase.

### Recommended (adds format constraint)

```
Extract only the ingredients and cooking steps from this section of a
recipe video transcript. Ignore narrative, commentary, music cues, and
sign-off content.

Return JSON only — no prose, no markdown:
{
  "ingredients": [{ "name": "...", "quantity": "..." }],
  "steps": ["step description..."]
}

If quantity is not mentioned, set quantity to null.
If no recipe content is present, return { "ingredients": [], "steps": [] }.

Transcript section:
[chunk text]
```

**Why JSON:** The reduce phase concatenates all 6 summaries and sends them to Gemini in one call. Structured JSON lets the reduce prompt reliably iterate over ingredients and steps without parsing ambiguous markdown. It also makes the empty case explicit (`[]` instead of silence).

**Trade-off:** JSON format adds a parsing step and a risk of malformed output. Mitigation: wrap the Gemini call in a `try/catch` with JSON.parse; fall back to storing the raw text if parsing fails.

---

## Implications for OQ6 (Reduce Prompt)

The reduce prompt receives 6 JSON summaries and must produce a single recipe overview. The test reveals three requirements:

1. **Deduplication.** Neutral oil and short ribs appear in both Chunk 1 and Chunk 2 due to overlap. The reduce prompt must consolidate duplicates into single entries.

2. **Quantity reconciliation.** Chunk 1 lists "star anise" without quantity; Chunk 3 lists "two star anise." The reduce prompt must prefer the more specific entry.

3. **Step ordering.** Steps are split across 6 chunks in correct order. The reduce prompt must maintain sequence — Chunk 1 steps come before Chunk 3 steps come before Chunk 5 steps.

Draft reduce prompt:

```
Below are section summaries from a recipe video, in order from first
to last. Each summary is a JSON object with "ingredients" and "steps".

Consolidate into a single recipe overview:
- Deduplicate ingredients, preferring entries that include a quantity
- Preserve step order across sections
- Omit any steps that are purely narrative (e.g. "cook for a couple
  of hours" with no further detail) if a more specific step covers
  the same action

Return JSON:
{
  "ingredients": [{ "name": "...", "quantity": "..." }],
  "steps": ["step 1...", "step 2..."]
}

Summaries:
[array of map phase JSON outputs]
```

This reduce prompt is a draft — needs its own test run against real map output once the JSON format is adopted.

---

## Decisions

| Question | Decision |
|----------|----------|
| Does the candidate map prompt filter filler correctly? | Yes — narrative, commentary, `[music]`, and sign-off content all ignored |
| Should the "return nothing" behaviour be required? | No — drop it. Overlap prevents empty output by design. Correct goal is "extract only recipe content." |
| Does the map prompt output need a format change? | Yes — force JSON output before wiring up the reduce phase |
| Is the chunk-level quality sufficient to proceed? | Yes — Chunk 3 captures the full sauce ingredient list including Tabasco-adjacent items, which was the key accuracy gap from the Buffalo Wings chat tests |
| What still needs a test run? | The reduce prompt draft (OQ6). Should be tested with the 6 JSON summaries once map prompt is updated to JSON format. |
