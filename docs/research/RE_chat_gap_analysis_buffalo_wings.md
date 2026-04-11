# Chat Gap Analysis — Buffalo Wings Conversation

**Status:** Research Complete
**Date:** 2026-04-10
**Video:** Why China hates Buffalo Wings (and how to fix it) — `youtube_video_id: -Tz4dZKPJjk`
**Purpose:** Identify accuracy gaps exposed by a real user conversation, and define further tests to stress-test the chat assistant before building the timestamp retrieval feature.

---

## Conversation Analysis

### Q1: "What's the first step in this recipe?"
**Chat answered:** Blend 85g of millet chilis with 1-2 cloves of garlic and 1/3 cup of water.

**Transcript confirms:** ✓ Accurate. The transcript says: *"They're called millet chilis, xiaomila...we'll blend 85g of those together with a clove or two of garlic together with a 1/3 of a cup of water."*

**Gap:** The video spends ~7 minutes on philosophy and cultural background before the first cooking step. The chat correctly identified the first *cooking* step but didn't flag that the video begins with extensive non-recipe discussion. A user who expected a step-by-step structure may not realise that.

---

### Q2: "What's the last step?"
**Chat answered:** Serve wings with deep-fried mantous, peeled celery, fresh mild chilies, and blue cheese dressing.

**Transcript confirms:** Plausible — transcript confirms mantous and celery as serving suggestions. Cannot fully verify without checking the end of the transcript.

**Gap:** None identified here.

---

### Q3: "What's the step after the first step?"
**Chat answered:** Pass the chili mixture through a fine mesh sieve.

**Transcript confirms:** ✓ Accurate. Transcript: *"Then, we'll pass that through a fine mesh sieve. And then with that, this is going to be our hot sauce base."*

**Gap:** None identified here.

---

### Q4: "When you say blending the chili garlic and water, what do you mean?"
**Chat answered:** Blend 85g of millet chilis with one or two cloves of garlic and 1/3 cup of water.

**Assessment:** Repeated the first answer correctly. No hallucination.

**Gap:** The chat didn't clarify what "millet chilis" (xiaomila/小米辣) are — a user unfamiliar with Chinese ingredients may still be confused. The transcript does explain them: *"actually pretty available at Chinese supermarkets in the West."* The chat should have surfaced this.

---

### Q5: "What do you do with the strained water and what's left in the sieve?"
**Chat answered:** The strained liquid is kept. The recipe doesn't specify what to do with the solids, implying they are discarded.

**Transcript confirms:** ✓ Correct — the transcript doesn't address the solids. The chat's inference is reasonable.

**Gap:** None identified here. The chat handled an unanswered question gracefully.

---

### Q6: Ingredient check — "I have the bouillon, chili powder, soy sauce, bourbon, white pepper — am I missing something?"
**Chat answered:** You are also missing salt, spicy chili powder, and garlic powder.

**Transcript ground truth:** The marinade is: salt, chicken bouillon powder, red fragrant chili powder, spicy chili powder, soy sauce, bourbon, **Tabasco**, white pepper, garlic powder.

**Gap: Tabasco was missed.** The chat omitted Tabasco from its missing-ingredient list, then confirmed it when the user self-corrected. This is a real accuracy failure on an ingredient-completeness check — exactly the type of question users will rely on while cooking. The transcript clearly states Tabasco is in the marinade.

**Severity: High.** A user following this chat while shopping or cooking would have left without Tabasco.

---

### Q7: "Is this a dry marinade and is it supposed to be for a certain amount of time?"
**Chat answered:** Not dry — includes soy sauce, bourbon, and Tabasco. Marinate in the fridge for at least a couple of hours.

**Transcript confirms:** ✓ Accurate. Transcript: *"Mix that well and then let that marinate in the fridge for at least a couple of hours."*

**Gap:** None identified here.

---

## Gaps Summary

| # | Gap | Severity | Source |
|---|-----|----------|--------|
| G1 | Chat didn't flag that the video opens with ~7 min of non-recipe discussion before the first cooking step | Low | Q1 |
| G2 | Chat didn't explain what "millet chilis" (xiaomila) are, despite the transcript having this information | Low | Q4 |
| G3 | Tabasco omitted from missing-ingredient check, only confirmed after user self-corrected | **High** | Q6 |
| G4 | No timestamp provided — user can't jump to the relevant part of the video | Medium | All |

---

## Suggested Further Tests

These are designed to probe the specific weaknesses identified above, plus additional edge cases for a 17-minute video with complex structure.

### Ingredient accuracy
- [ ] **"Give me the complete ingredient list for this recipe"** — verify all ingredients are present including Tabasco, xiaomila, egg white, cornstarch, mantou. Check for omissions.
- [ ] **"What are the exact quantities for the marinade?"** — transcript has specific amounts (1 tsp salt, ½ tsp bouillon, ½ tbsp red chili powder, etc.). Verify precision.
- [ ] **"What's the difference between the red fragrant chili powder and the spicy chili powder?"** — these are two separate ingredients. Does the chat distinguish them or conflate them?

### Step ordering & completeness
- [ ] **"Walk me through every step of the frying process"** — should cover: marinate → egg white + cornstarch slurry → oil to 120°C → first fry → second fry. Any steps missed?
- [ ] **"What happens after the wings come out of the fryer?"** — should describe the stir fry sauce step, which is a separate sauce from the hot sauce base.
- [ ] **"How many sauces are in this recipe?"** — there are two distinct sauces: the hot sauce base (xiaomila blended) and the stir fry finishing sauce. Does the chat correctly separate them?

### Ambiguity & confusion
- [ ] **"Where does the bourbon go?"** — bourbon appears in both the marinade AND the stir fry sauce. Does the chat correctly surface both uses or only one?
- [ ] **"What temperature should the oil be?"** — transcript mentions 120°C for first fry. Check if the chat gets this right and doesn't confuse it with a second fry temperature if one exists.
- [ ] **"What is xiaomila and where can I get it?"** — the transcript answers this directly. Does the chat surface the explanation?

### Narrative vs recipe confusion
- [ ] **"What does the video say about Frank's Red Hot?"** — this is discussed in the philosophical section, not the recipe. Does the chat correctly describe it as context/opinion rather than a recipe step?
- [ ] **"What coffee does the video recommend?"** — the 6:00 boundary falls in a Trade Coffee sponsor segment. Does the chat answer from the sponsor content, or correctly stay on recipe topic?

### Edge cases
- [ ] **"Can I skip the sieve step?"** — tests whether the chat can reason about substitutions/shortcuts not explicitly in the transcript.
- [ ] **"What is mantou and do I have to make it myself?"** — tests whether the chat can explain an unfamiliar ingredient mentioned in passing.
- [ ] **"How long does this recipe take in total?"** — tests whether the chat can synthesise timing across multiple steps (marinade: couple of hours + fry time + rest).

---

## Key Observation for Chunking PRD

The Tabasco miss (G3) is the most important finding. This is a 17-minute video with ~3,855 tokens — at the upper edge of what Gemini can reliably process at thinking budget 0. The missed ingredient suggests **attention degradation on long transcripts**, which is exactly the problem chunking is designed to solve. Storing the marinade section as its own chunk with a focused summary would make an ingredient-completeness check significantly more reliable.
