# Map Phase Quality Analysis — Honey Miso Short Rib

**Status:** Research Complete
**Date:** 2026-04-12
**Purpose:** Dedicated quality analysis of the map phase across two test runs. Compares Run 1 (JSON with code fences) and Run 2 (JSON, no code fences fix applied). Covers code fence fix verification, bone removal gap, duplicate step generation, step ordering errors, and what the reduce phase needs to tolerate.

---

## TL;DR

- **Code fence fix:** Confirmed working — Run 2 returns clean JSON on all 6 chunks, no stripping needed.
- **Bone removal:** Captured in Run 2 Chunk 1 as an optional step — but this is Gemini variance, not a reliable change. The prompt didn't change the extraction logic, only the format instruction.
- **New problems in Run 2:** Chunk 1 has a step ordering error (sear listed before oil is added). Chunks 3 and 5 each have duplicate steps from the overlap region.
- **Key finding:** Map output quality is non-deterministic. The reduce phase cannot assume clean, deduplicated, correctly-ordered input — it must handle duplicate and near-duplicate steps within a single chunk's output.
- **Decision:** Map prompt is approved for Phase 1. Reduce prompt's deduplication instruction covers the cross-chunk case but not the within-chunk duplicate case. Add "remove any repeated steps within your output" to the map prompt.

---

## Test Setup

**Script:** `scripts/test-map-prompt.js`  
**Change from prior run:** "no code fences" added to format line  
**Run 1:** JSON format, code fences present in 5 of 6 responses  
**Run 2:** JSON format, "no code fences" instruction added  

---

## Code Fence Fix: Verified

| Chunk | Run 1 (fences?) | Run 2 (fences?) |
|-------|----------------|----------------|
| 1 | ✅ ```json ... ``` | ✅ clean |
| 2 | ✅ clean | ✅ clean |
| 3 | ✅ ```json ... ``` | ✅ clean |
| 4 | ✅ ```json ... ``` | ✅ clean |
| 5 | ✅ ```json ... ``` | ✅ clean |
| 6 | ✅ ```json ... ``` | ✅ clean |

Run 2 all clean. The fix works. Defensive `.replace(/```json\n?|\n?```/g, '').trim()` should still be applied before `JSON.parse` in the implementation — the reduce test confirmed clean output but one-off model behaviour could always reintroduce fences.

---

## Chunk-by-Chunk Comparison

### Chunk 1 — Seasoning + Start of Sear

**Run 1 (4 steps):**
```
1. Season the short ribs with salt and pepper.
2. Ensure all sides of the short ribs are seasoned.
3. Add neutral oil (high smoke point avocado oil) to a pot.
4. Sear the seasoned short ribs in the pot.
```

**Run 2 (6 steps):**
```
1. Take short ribs and season them with salt and pepper.
2. Add salt to the whole bowl of short ribs and toss them around.
3. Add black pepper to the short ribs and toss them to ensure all sides are seasoned.
4. Remove bones from short ribs if present (optional).
5. Sear the seasoned short ribs in a pot.
6. Add neutral oil (high smoke point avocado oil) to the pot for searing.
```

**What changed:**

✅ **Bone removal captured in Run 2** (Step 4) — *"Remove bones from short ribs if present (optional)."* The optional framing is correct. This is the gap identified in the reduce analysis.

❌ **Steps 1–3 are redundant** — three steps all describe the same seasoning action. Run 1 produced one clean step. Run 2 expanded it to three near-duplicates. This is noise the reduce phase will need to collapse.

❌ **Step ordering error** — Step 5 ("Sear the seasoned short ribs") comes before Step 6 ("Add neutral oil to the pot for searing"). This is wrong — oil goes in the pan before the ribs. The transcript is unambiguous: *"Let's go ahead and add our neutral oil... Add that to the pan. And then we're going to go ahead and drop in our short ribs."* The reduce phase will carry this ordering error forward unless it reasons about cooking logic, which it doesn't.

**Ingredients — Run 1 vs Run 2:**

Run 1 listed "neutral oil" and "high smoke point avocado oil" as two entries. Run 2 listed "neutral oil" and "avocado oil" as two entries. Same duplication problem, slightly different names. The reduce phase merged them correctly in the first test — this will need to work on Run 2's naming too.

---

### Chunk 2 — Sear Continues + Veg Prep

**Run 1:**
```
Drop in the short ribs and pack them in, searing in batches if necessary.
Flip the short ribs to get color on both sides. Sear for a couple more minutes.
Slice ginger. Crush garlic. Rough chop green onions, reserving some for garnish.
Remove outer layer of skin from the shallot.
```

**Run 2:**
```
Add neutral oil (high smoke point avocado oil) to the pan.
Drop in short ribs and sear, packing in as many as possible (in batches if needed).
Flip short ribs to get color on all sides.
Cut ginger into slices. Crush garlic to release flavor.
Rough chop green onions, reserving some for garnish.
Remove the outer layer of skin from the shallot.
```

✅ **Batch searing captured in Run 2** — "in batches if needed" present. Missing in Run 1.  
✅ **Parallel prep timing**: both runs list veg prep steps as sequential after flipping. Neither flags the simultaneous nature — consistent behaviour, not a regression.  
⚠️ **"neutral oil" repeated** from overlap — Chunk 2 starts in the overlap region of Chunk 1, so it re-lists oil as both an ingredient and a step. Expected from the overlap design.

---

### Chunk 3 — Sauce Build (Most Content-Rich)

**Run 1 (9 steps, clean):**
```
Throw green onions, shallots, garlic, ginger → into pot
Pull short ribs out, set aside
Deglaze with mirin, stir
Add miso, cook down
Add soy sauce, dark soy sauce
Add honey, two star anise, stir
Add short ribs back in, add broth, cook couple of hours
```

**Run 2 (15 steps, with duplicates):**
```
1. Throw green onions in the pot.
2. Take off the outer layer of skin from the shallot and throw it in.
3. Pull out the short ribs and set them aside.
4. Toss in garlic, shallot, and ginger.
5. Throw in green onions.         ← duplicate of Step 1
6. Deglaze with mirin. Stir.
7. Add miso, cook down.
8. Add soy sauce.
9. Add dark soy sauce.
10. Add honey and two star anise. Stir.
11. Add short rib back in.
12. Add broth.
13. Cook for a couple of hours.
```

❌ **Steps 1 and 5 are duplicates** — "Throw green onions in the pot" appears twice. This is because the overlap region from Chunk 2 brought in "don't use all your green onions throwing them in the pot" which Gemini interpreted as a step, and then the sauce-build section also mentions green onions going into the pot. Two different moments in the recipe, same action description.

❌ **Step 2 is from the overlap** — "Take off the outer layer of skin from the shallot and throw it in" is the tail end of Chunk 2's prep section, carried over by the overlap. It appears here as an early step before pulling the ribs, which is incorrect timing (shallot prep happens before this section, not at this point in the sauce build). The reduce phase will need to deduplicate this against Chunk 2's step 7.

✅ **All sauce ingredients present** — mirin, miso, soy, dark soy, honey, star anise (two), broth all correctly captured.

---

### Chunk 4 — Filler (Narrative)

**Run 1 (5 steps):**
```
Add short rib back in, add broth, cook 2 hours.
Put lid on, place in oven.
Remove short ribs when tender.
Cook down sauce for thick glaze.
```

**Run 2 (7 steps):**
```
Add our short rib back in.
Add our broth.
Let this cook for a couple of hours.
Put this in our oven now.
Let this cook.         ← vague duplicate of "cook for a couple of hours"
Remove the short rib.
Cook down the sauce to get a really nice thick glaze.
```

⚠️ **Run 2 has more granular but noisier steps** — "Let this cook for a couple of hours" and "Let this cook" are near-duplicates. The second is from the overlap carrying "our short ribs will be cooking" — content-free. Run 1 produced a tighter summary here.

✅ **Narrative filler ignored in both runs** — the luxury/date-night monologue produces no steps in either run.

---

### Chunk 5 — Sauce Reduction + Cornstarch

**Run 1 (5 steps, clean):**
```
Remove short ribs from pot.
Strain all vegetables and ginger from broth. Return broth to pot.
Reduce the strained broth into a sauce.
Add cornstarch slurry once sauce reaches boil.
Whisk until thickened.
```

**Run 2 (8 steps, with duplicates):**
```
1. Get the short ribs out.
2. Strain all of the vegetables and ginger from the broth.
3. Put the strained broth back into the pot.
4. Reduce the broth to turn it into a sauce.
5. Strain all the vegetables out of the broth.   ← duplicate of Step 2
6. Add the leftover broth to the pot.             ← duplicate of Step 3
7. Add the corn starch slurry to the sauce.
8. Whisk the sauce until it thickens.
```

❌ **Steps 2/5 and 3/6 are exact duplicates** — the overlap region caused Gemini to extract the straining and broth-return steps twice. Steps 2–3 come from the overlap (Chunk 4 tail), Steps 5–6 come from the main body of Chunk 5. Same actions, identical meaning. The reduce phase will need to handle these.

---

### Chunk 6 — Plating + Outro

**Run 1 (5 steps):**
```
Cornstarch → add, whisk
Add short rib back to sauce and coat
Plate two per person, pour sauce, garnish with green onions
Serve over whipped potatoes
```

**Run 2 (6 steps):**
```
Add cornstarch. Whisk the sauce.
Add short rib back into the sauce to coat.
Place two short ribs in the center of the plate.
Pour extra sauce over the top.
Garnish with green onions.
```

✅ **Sign-off correctly ignored** in both runs.  
⚠️ **"Serve over whipped potatoes" missing in Run 2** — whipped potatoes is still in the ingredients list but the serving step is absent. Run 1 included it as a step. Non-deterministic omission.

---

## Problem vs Solution

| Issue | Run 1 | Run 2 | Fix |
|-------|-------|-------|-----|
| Code fences in output | 5 of 6 chunks | 0 of 6 chunks | ✅ Fixed |
| Bone removal captured | ✗ | ✓ (Chunk 1, Step 4) | Gemini variance — not guaranteed. Consider adding "include conditional steps" to prompt. |
| Within-chunk duplicate steps | Not present | Chunks 3 and 5 | Add "remove any repeated steps within your output" to map prompt |
| Step ordering error | None | Chunk 1 (sear before oil) | Add "steps must be in the order they appear in the transcript" to map prompt |
| Redundant seasoning steps | Clean (1 step) | Noisy (3 steps) | Same fix as duplicate steps |
| Batch searing captured | ✗ | ✓ (Chunk 2) | Gemini variance — not guaranteed |
| "whipped potatoes" as step | ✓ | ✗ | Gemini variance — not guaranteed |

---

## Root Cause: Overlap Region Generates Duplicate Steps

The core issue is predictable. RCTS overlap carries ~150 chars (1–2 sentences) of the previous chunk into the start of the next. If those sentences describe a recipe action, Gemini extracts them as a step. The same action then appears again when Gemini processes the main body of the chunk. Result: exact or near-exact duplicate steps within a single chunk's output.

```
Chunk 4 tail (overlap into Chunk 5):
  "...strain all of those vegetables, the ginger and everything and
   put that back into our pot..."
  → Gemini extracts: "Strain vegetables and ginger. Return broth to pot."

Chunk 5 main body:
  "We just want to go ahead and strain all of the vegetables out...
   now we're going to add that leftover broth to our pot..."
  → Gemini extracts: "Strain all vegetables out. Add leftover broth to pot."

Both appear in Chunk 5's output → duplicate pair.
```

This is structural — it will happen on any chunk where the overlap region contains recipe steps rather than narrative transition. In this recipe, Chunks 3 and 5 are most affected because their overlap regions happen to land in the middle of active cooking sequences.

---

## Side-by-Side: Map Prompt Additions Needed

```
# Current map prompt:
Extract only the ingredients and cooking steps from this section of a
recipe video transcript. Ignore narrative, commentary, music cues, and
sign-off content.

Return JSON only — no prose, no markdown, no code fences:
...

# Recommended additions (two lines):
Extract only the ingredients and cooking steps from this section of a
recipe video transcript. Ignore narrative, commentary, music cues, and
sign-off content. Include conditional or optional steps (e.g. "if the
meat has a bone, remove it before searing"). Steps must be in the order
they appear in the transcript. Remove any repeated steps from your output.

Return JSON only — no prose, no markdown, no code fences:
...
```

These two additions address:
- **Bone removal** — "include conditional or optional steps" should capture preference-framed steps consistently
- **Duplicate steps** — "remove any repeated steps" targets the overlap-region problem
- **Step ordering** — "steps must be in the order they appear" targets the oil-before-sear error in Run 2

---

## Decisions

| Question | Decision |
|----------|----------|
| Is the code fence fix confirmed? | Yes — all 6 chunks returned clean JSON in Run 2. |
| Is bone removal reliably captured? | No — it appeared in Run 2 but not Run 1 with the same prompt. Gemini variance. Prompt addition ("include conditional steps") needed to make it consistent. |
| Is the reduce phase at risk from within-chunk duplicates? | Yes — Chunks 3 and 5 both produced duplicate steps in Run 2. The reduce prompt's deduplication instruction covers cross-chunk duplicates but not within-chunk. Map prompt fix ("remove any repeated steps") is the right layer to fix this. |
| Is the step ordering error a blocker? | Low severity for Phase 1 — the reduce phase re-sequences correctly in practice. Adding "steps must be in the order they appear" to the map prompt is low-cost and reduces reduce-phase burden. |
| Should the updated prompt be retested before implementation? | Yes — the three additions (conditional steps, no repeats, order constraint) should be verified in a Run 3 before the implementation script is written. |
| Does the reduce prompt need changes based on these findings? | No — the reduce prompt is still correct. It may benefit from seeing cleaner map output once the map prompt additions are applied. |
