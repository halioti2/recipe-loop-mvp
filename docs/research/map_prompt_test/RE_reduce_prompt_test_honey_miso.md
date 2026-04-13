# Reduce Prompt Test Results — Honey Miso Short Rib

**Status:** Research Complete
**Date:** 2026-04-12
**Purpose:** Evaluate the OQ6 candidate reduce prompt against the 6 JSON map summaries produced in the map prompt test. Determine whether Gemini correctly deduplicates ingredients, preserves step order, and produces a single coherent recipe summary suitable for use as chat context.

---

## TL;DR

- **Problem:** OQ6 asks whether the candidate reduce prompt can consolidate 6 overlapping chunk summaries into one clean recipe overview, handling deduplication, quantity preference, and step ordering.
- **Input:** 6 JSON map summaries (from `RE_map_prompt_test_honey_miso.md`, JSON format run)
- **Finding:** Reduce phase passed. Output parsed on first attempt with no code fences. 17 deduplicated ingredients, 28 ordered steps, no step order violations, quantities correctly preferred over nulls. One minor prompt issue: map phase still emits code fences in 5 of 6 calls — needs "no code fences" added to map prompt.
- **Decision:** Both prompts are approved for Phase 1 implementation. Map prompt needs one-line fix (add "no code fences" to the format instruction). Reduce prompt ships as tested.

---

## Test Setup

**Script:** `scripts/test-reduce-prompt.js`
**Model:** gemini-2.5-flash, `thinkingBudget: 0`
**Input:** 6 map summaries (cleaned, code fences stripped, passed as JSON array)
**Single call:** One Gemini request for the full reduce step
**Total time:** 3,102ms

---

## Raw Output

```json
{
  "ingredients": [
    { "name": "green onion", "quantity": null },
    { "name": "garlic", "quantity": null },
    { "name": "ginger", "quantity": null },
    { "name": "star anise", "quantity": "two" },
    { "name": "shallot", "quantity": "one" },
    { "name": "short ribs", "quantity": "about six" },
    { "name": "salt", "quantity": null },
    { "name": "black pepper", "quantity": null },
    { "name": "neutral oil (avocado)", "quantity": null },
    { "name": "mirin", "quantity": null },
    { "name": "miso", "quantity": null },
    { "name": "soy sauce", "quantity": null },
    { "name": "dark soy sauce", "quantity": null },
    { "name": "honey", "quantity": null },
    { "name": "broth", "quantity": null },
    { "name": "cornstarch slurry", "quantity": null },
    { "name": "whipped potatoes", "quantity": null }
  ],
  "steps": [
    "Season the short ribs with salt and pepper on all sides.",
    "Add neutral oil (high smoke point avocado oil) to a pot.",
    "Sear the seasoned short ribs in the pot.",
    "Flip the short ribs to get color on both sides. Sear for a couple more minutes.",
    "Slice ginger.",
    "Crush garlic.",
    "Rough chop green onions, reserving some for garnish.",
    "Remove outer layer of skin from the shallot.",
    "Pull out seared short ribs and set aside.",
    "Add garlic, shallot, ginger, and green onions to the pot.",
    "Add mirin and deglaze, stirring to lift bits off the bottom.",
    "Add miso and cook it down.",
    "Add soy sauce (hefty amount) and dark soy sauce.",
    "Add honey and two star anise. Stir.",
    "Add short ribs back in.",
    "Add broth.",
    "Put the lid on and place in the oven.",
    "Cook for a couple of hours until short ribs are tender.",
    "Remove the short ribs.",
    "Strain all vegetables and ginger from the broth. Return broth to pot.",
    "Reduce the strained broth into a sauce.",
    "Add cornstarch slurry once the sauce reaches a boil.",
    "Whisk until thickened.",
    "Add short ribs back into the thickened sauce and coat.",
    "Plate two short ribs per person in the center.",
    "Pour extra sauce over the top.",
    "Garnish with green onions.",
    "Serve over whipped potatoes."
  ]
}
```

**Parsed:** ✅ First attempt, no post-processing needed
**Ingredients:** 17
**Steps:** 28

---

## Pass/Fail Evaluation

| Test | Result | Notes |
|------|--------|-------|
| JSON parses on first attempt | ✅ Pass | No code fences in reduce output |
| Ingredient deduplication | ✅ Pass | 17 unique ingredients from ~30 across 6 chunks |
| Quantity preference (non-null over null) | ✅ Pass | star anise → "two", short ribs → "about six", shallot → "one" |
| "neutral oil" + "high smoke point avocado oil" merged | ✅ Pass | Single entry: "neutral oil (avocado)" |
| Step order preserved across chunks | ✅ Pass | Steps 1–28 follow recipe sequence start to finish — verified against full transcript |
| Exact duplicate steps removed | ✅ Pass | "Cook for a couple of hours" appears once, not three times |
| "Add short ribs back in" (Steps 15 and 24) | ✅ Correct | These are different steps — braise vs coat-before-plating |
| Whipped potatoes captured from Chunk 6 | ✅ Pass | Late-video ingredient correctly surfaced |
| Sign-off content excluded | ✅ Pass | "Like, comment, share" never appears in output |
| **Bone removal step** | ❌ Missing | Optional prep step dropped — see gap analysis below |
| **Batch searing detail** | ⚠️ Partial | "in batches if necessary" dropped from searing step |
| **Parallel prep timing** | ⚠️ Flattened | Veg prep shown sequential; transcript says "while finishing sear" |

---

## Ingredient Analysis

The transcript provides very few quantities. The reduce output correctly carries through all that exist:

| Ingredient | Quantity in output | From chunk |
|------------|-------------------|------------|
| star anise | two | Chunk 3 (preferred over null in Chunk 1) |
| shallot | one | Chunk 1 |
| short ribs | about six | Chunk 3 (preferred over null in Chunk 1) |
| All others | null | Not specified in transcript |

Ingredients that could have been lost to deduplication but weren't:
- **dark soy sauce** — distinct from soy sauce, correctly kept as a separate entry
- **whipped potatoes** — only appears in Chunk 6 (plating section), correctly surfaced

Ingredients from the raw transcript not in the output:
- **"onomi"** — appears once: *"I've got some onomi. We're going to add our short rib back in there. Get them nice and coated."* Almost certainly a mis-transcription of a vessel name (bowl, ladle) rather than a standalone ingredient — the "coating" is the thickened sauce already in the pan. Step 24 captures the action correctly. Negligible as an ingredient gap.

---

## Step Analysis

### Step order

Steps 1–28 follow chronological cooking order. No reordering detected:

```
Steps 1–4   → Seasoning and searing short ribs
Steps 5–8   → Vegetable prep (ginger, garlic, green onion, shallot)
Steps 9–16  → Sauce base build (deglaze, miso, soy, honey, braise start)
Steps 17–18 → Oven cook
Steps 19–23 → Sauce reduction and thickening
Steps 24–28 → Plating and garnish
```

### Duplicate removal

"Cook for a couple of hours" appeared in Chunk 3, Chunk 4 (via overlap), and Chunk 5's context. The reduce output includes it once (Step 18: "Cook for a couple of hours until short ribs are tender") with the completion condition added from Chunk 4 — better than any individual chunk produced alone.

### "Add short ribs back in" — two appearances

Step 15 ("Add short ribs back in") and Step 24 ("Add short ribs back into the thickened sauce and coat") are genuinely different actions:
- Step 15: short ribs go into the braise liquid to cook for 2 hours
- Step 24: short ribs are reintroduced to the reduced sauce just before plating

The reduce prompt correctly kept both. This is the kind of distinction that a flat transcript often obscures — having it explicit in the summary will make the chat assistant more reliable when asked "when do I add the short ribs?"

### Verified against full transcript

Steps 1–28 were checked against the complete stored transcript (7,721 chars). Three gaps identified:

**Gap 1 — Bone removal (Medium severity)**
Transcript: *"if you buy yours at the store and they come with the bone, I like to just remove the bone."*
This is a real optional prep step — it affects how the meat is handled before searing. Missing from all 6 chunk summaries and from the reduce output. Root cause: the map prompt instruction to "ignore narrative, commentary" caused Gemini to read this as the cook's personal preference rather than a recipe action. It is framed as a preference, but it's also a concrete step that some users will need to take.

**Gap 2 — Batch searing detail (Low severity)**
Transcript: *"Pack them in as many as you can. If you have to do it in batches, do what you have to do."*
Step 3 says "Sear the seasoned short ribs in the pot" without the batching guidance. Practical cooking advice rather than a recipe accuracy failure.

**Gap 3 — Parallel prep timing (Low severity)**
Transcript: *"while we're finishing up our sear, let's go ahead and prep our vegetables."*
Steps 5–8 (veg prep) appear after Steps 3–4 (searing), implying they are sequential. The transcript explicitly says to run them simultaneously. A user following the summary would start veg prep after searing finishes rather than during. The chat would still give correct ingredient and step answers — this only affects pacing.

### "Onomi" — not an ordering or step error

*"I've got some onomi. We're going to add our short rib back in there."* — this is a transcribing error, not an ingredient. cook mumbles to himself and it is mistranscribed. Step 24 ("Add short ribs back into the thickened sauce and coat") captures the action correctly. Gap is a mistranscribed sentce could be taken as an ingredient.

### Parallel steps presented sequentially

Same issue as Gap 3 above — acceptable for Phase 1. The summary is a text context for chat, not a formatted recipe card.

---

## Data Flow: Full Pipeline End-to-End

```
Honey Miso transcript (7,721 chars — above 5,000 char threshold)
  │
  ├─ F1: Noise strip → [music] tokens removed
  │
  ├─ F2/F3: RCTS split → 6 chunks (1,493–1,323 chars, 150 char overlap)
  │
  ├─ F5: Map phase (parallel) → 6 JSON summaries
  │   ├─ Chunk 1: 9 ingredients, 3 steps (1,577ms)
  │   ├─ Chunk 2: 5 ingredients, 6 steps (1,547ms)
  │   ├─ Chunk 3: 12 ingredients, 9 steps (2,075ms)
  │   ├─ Chunk 4: 2 ingredients, 7 steps (1,077ms)
  │   ├─ Chunk 5: 1 ingredient,  5 steps (1,545ms)
  │   └─ Chunk 6: 4 ingredients, 5 steps (1,219ms)
  │   Total parallel: 2,106ms
  │
  ├─ F6: Reduce phase (single call) → 1 JSON summary (3,102ms)
  │   17 ingredients, 28 steps
  │
  └─ F8: Store in recipes.transcript_summary
         Chat reads this instead of raw transcript
```

**Total pipeline time (map + reduce):** ~5,208ms for a 7,721 char transcript. Acceptable for a standalone script — not on the critical path of page load.

---

## Remaining Map Prompt Issue: Code Fences

The JSON-format map prompt run produced code fences in 5 of 6 responses despite the instruction "Return JSON only — no prose, no markdown":

```
# Chunk 1 response (typical):
```json
{
  "ingredients": [...],
  "steps": [...]
}
```
```

Chunk 2 returned clean JSON. Chunks 1, 3, 4, 5, 6 wrapped in fences.

The reduce prompt — which added "no code fences" explicitly — returned clean JSON on the first call. The fix for the map prompt is one line:

```
# Current (incomplete):
Return JSON only — no prose, no markdown:

# Fix (add explicit fence instruction):
Return JSON only — no prose, no markdown, no code fences:
```

This is the same fix already present in the reduce prompt. The implementation script must also strip fences defensively with `.replace(/```json\n?|\n?```/g, '').trim()` before `JSON.parse` — the same pattern used in `playlist-enrich-processor.js` for ingredient extraction. Belt and suspenders.

---

## Problem vs Solution

| Issue | Status | Fix |
|-------|--------|-----|
| Reduce output JSON parses cleanly | ✅ Solved | No action needed |
| Ingredient deduplication | ✅ Solved | Reduce prompt handles this reliably |
| Quantity preference | ✅ Solved | Reduce prompt instruction sufficient |
| Step deduplication | ✅ Solved | "Remove exact duplicate steps" instruction worked |
| Parallel prep steps shown as sequential | ⚠️ Known limitation | Acceptable for Phase 1. Could add "note parallel steps" to reduce prompt in Phase 2. |
| Map prompt emits code fences | ❌ Needs fix | Add "no code fences" to map prompt format instruction |
| Map prompt parse must be defensive | ❌ Needs fix | Add `.replace(/```json...```)` strip before JSON.parse in implementation |

---

## Side-by-Side: Map Prompt Fix

```
# Current map prompt format line:
Return JSON only — no prose, no markdown:

# Fixed:
Return JSON only — no prose, no markdown, no code fences:
```

That is the only change needed. The reduce prompt is already correct.

---

## Decisions

| Question | Decision |
|----------|----------|
| Does the reduce prompt produce usable chat context? | Yes — 17 deduplicated ingredients and 28 ordered steps. Three verified gaps: bone removal step (medium), batch searing detail (low), parallel prep timing (low). None are accuracy failures for ingredient or sauce questions. |
| Are both prompts ready to ship for Phase 1? | Yes, with two caveats: (1) add "no code fences" to map prompt; (2) the bone removal gap means optional prep steps framed as cook preferences will be dropped. Acceptable for Phase 1 — the chat can still answer ingredient and sauce questions correctly. |
| Should the map prompt be changed to capture optional steps? | Defer. Requires testing whether adding "include optional or conditional steps (e.g. if X, do Y)" to the map prompt captures bone removal without also pulling in narrative filler. Not blocking for Phase 1. |
| Should the implementation parse defensively even after the fix? | Yes — strip code fences before JSON.parse regardless, same pattern as ingredient extraction in `playlist-enrich-processor.js`. |
| Is the full map+reduce pipeline fast enough for a standalone script? | Yes — ~5.2s total for a 7,721 char transcript. Three long videos × ~5s = ~15s total, well within standalone script tolerance. |
| Does transcript_summary produced here solve the Tabasco accuracy gap? | Likely yes — Chunk 3's summary includes all sauce ingredients explicitly. The reduce output carries them forward. The only way to confirm is to run the chat against the stored summary on the Buffalo Wings video once the pipeline is built. |
| What's left before implementation? | Apply "no code fences" fix to map prompt, then build the chunking script (F1–F11 in PRD_transcript_chunking.md). OQ5 and OQ6 are now resolved. |
