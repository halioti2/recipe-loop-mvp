# Chat Test Results — Buffalo Wings

**Status:** Research Complete
**Date:** 2026-04-10
**Video:** Why China hates Buffalo Wings (and how to fix it) — `youtube_video_id: -Tz4dZKPJjk`
**Purpose:** Full chained conversation test — all 21 questions run in a single session with history passed on every turn, matching real chat behaviour. Original conversation questions run first, followed by further stress tests.

---

## Original Conversation Questions

**Q1: What's the first step in this recipe?**
> "The first step is to marinate the wings."

**Assessment: ✗ Different from isolated test** — without history the answer was "blend 85g of millet chilis." With history established, it shifted to "marinate the wings." Based on the transcript, the hot sauce base blending (~7:00) occurs before the marinade (~12:00) in the video. The chained answer is likely wrong on step order. Neither answer flags that the video opens with 7+ minutes of non-recipe discussion.

---

**Q2: What about the last step?**
> "Serve the wings with celery, fresh mild chilies, and blue cheese dressing."

**Assessment: ✓ Pass** — reasonable, consistent with transcript.

---

**Q3: What's the step after the first step?**
> "Whisk one egg white and mix it with a slurry of 10g each of water and cornstarch, then mix well with the wings."

**Assessment: ✗ Consequence of Q1 error** — because Q1 established marinating as first step, Q3 logically follows with egg white coating. This is internally consistent but carries forward the step-order error from Q1. The actual next step after marinating in the transcript is the egg white slurry, so it's not entirely wrong — just anchored to the wrong starting point.

---

**Q4: When you say blending the chili garlic and water, what do you mean?**
> "Blend 85g of millet chilis with 1-2 cloves of garlic and 1/3 cup of water, then pass through a fine mesh sieve to create the hot sauce base."

**Assessment: ✓ Pass with flag** — correctly answered even though blending hadn't been mentioned yet in this conversation thread (the history was about marinating). The model retrieved the correct information but the question now feels contextually odd given the conversation flow — a real user would notice this doesn't connect to what the chat previously called "step 1."

---

**Q5: What do you do with the strained water and what's left in the sieve?**
> "The strained liquid is your hot sauce base. The recipe does not specify what to do with the solids, implying they are discarded."

**Assessment: ✓ Pass** — same as isolated test. Correct and honest about the gap.

---

**Q6: What do you do next?**
> "After creating the hot sauce base, combine it with chicken stock or water, milk powder, Tabasco, sugar, rice vinegar, white pepper, MSG, and garlic powder."

**Assessment: ✓ Pass** — correctly described the sauce preparation as the next step after the hot sauce base, using history context appropriately.

---

**Q7: I have bouillon, chili powder, soy sauce, bourbon, white pepper — am I missing something?**
> "Yes, you are missing salt and garlic powder for the wing marinade."

**Assessment: ✗ Fail — Tabasco missed again.** Consistent with the original conversation. Even with full conversation history (including Q6 which mentioned Tabasco in the sauce), the model still omitted Tabasco from the marinade ingredient check. This is a confirmed repeatable failure, not a one-off.

---

**Q8: Looks like I'm also missing the Tabasco**
> "You are correct; Tabasco is also needed for the wing marinade."

**Assessment: ✓ Confirmed correctly when prompted** — but requires the user to self-correct every time.

---

**Q9: Is this a dry marinade and is it supposed to be for a certain amount of time?**
> "No, it's not dry — includes soy sauce, bourbon, and Tabasco. Marinate in the fridge for at least a couple of hours."

**Assessment: ✓ Pass** — matches transcript exactly.

---

## Further Stress Tests (chained, continuing same session)

**Q10: Give me the complete ingredient list for this recipe**
> Returned full structured list across 5 sections: Wings & Marinade, Hot Sauce Base, Sauce, Sides, Blue Cheese Dressing. Tabasco present in both marinade and sauce sections.

**Assessment: ✓ Pass** — Tabasco included when asked for a complete list. Confirms Q7 failure is about how the question is framed, not about the model not knowing Tabasco exists.

---

**Q11: What are the exact quantities for the marinade?**
> 1 tsp salt, ½ tsp bouillon, ½ tbsp red fragrant chili powder, ¼ tsp white pepper, ¼ tsp garlic powder. Correctly flagged soy sauce, bourbon, and Tabasco amounts as unspecified.

**Assessment: ✓ Pass** — accurate. Honest about unspecified amounts.

---

**Q12: What is the difference between the red fragrant chili powder and the spicy chili powder?**
> "The recipe lists 'half tablespoon of a red fragrant chili powder, a spicy chili powder,' which implies they are the same ingredient or that 'a spicy chili powder' is further describing the 'red fragrant chili powder.'"

**Assessment: ✗ Worse than isolated test** — without history the answer was "the recipe doesn't specify a difference." With history, the model actively collapsed them into a single ingredient. The transcript lists them separately. History degraded this answer.

---

**Q13: Walk me through every step of the frying process**
> Correctly described: first fry at 120°C for ~1 min, second fry at 175°C for ~4 min, full stir-fry sauce process including butter mounting.

**Assessment: ✓ Pass** — detailed and accurate, consistent with isolated test.

---

**Q14: What happens after the wings come out of the fryer?**
> "After the wings come out of the fryer, you will prepare the sauce and then toss the piping hot, deep-fried wings in it."

**Assessment: ✓ Pass — improved over isolated test** — the isolated test gave a thin one-liner. With conversation history built up about the sauce, this answer correctly added the tossing step. History helped here.

---

**Q15: How many sauces are in this recipe?**
> "Three: (1) Homemade Hot Sauce Base, (2) Buffalo Sauce built from the base, (3) Blue Cheese Dressing."

**Assessment: ✓ Pass — corrected from isolated test** — the isolated test returned 2 sauces (incorrectly collapsing base and buffalo sauce). With conversation history having discussed both sauces extensively, the model correctly identified all 3. History fixed this failure.

---

**Q16: Where does the bourbon go?**
> "Bourbon is used in two places: wing marinade and the buffalo sauce stir-fry."

**Assessment: ✓ Pass** — consistent with isolated test.

---

**Q17: What temperature should the oil be?**
> "120°C for first fry, 175°C for second fry."

**Assessment: ✓ Pass** — consistent with isolated test.

---

**Q18: What is xiaomila and where can I get it?**
> "Millet chilis, available at Chinese supermarkets in the West."

**Assessment: ✓ Pass** — consistent with isolated test.

---

**Q19: What does the video say about Frank's Red Hot?**
> "'Completely fucking garbage,' tastes like 'vinegar essence,' white vinegar that somebody lightly whispered 'chili pepper' over."

**Assessment: ✓ Pass** — better quote than isolated test, history didn't degrade this.

---

**Q20: What coffee does the video recommend?**
> "The video does not mention or recommend any coffee."

**Assessment: ✓ Pass** — sponsor segment correctly ignored, consistent with isolated test.

---

**Q21: How long does this recipe take in total?**
> "At least a couple of hours for marinating. No explicit total time given."

**Assessment: ✓ Pass** — honest about what the transcript doesn't say.

---

## Summary

| # | Question | Isolated | Chained | Notes |
|---|----------|----------|---------|-------|
| 1 | First step | Blend chilis | Marinate wings | Both potentially wrong on order — chained shifted answer |
| 2 | Last step | ✓ | ✓ | Consistent |
| 3 | Step after first | ✓ | Carried forward Q1 error | Internally consistent but anchored to wrong start |
| 4 | Blending meaning | ✓ | ✓ | Correct despite context disconnect |
| 5 | Strained liquid | ✓ | ✓ | Consistent |
| 6 | What to do next | ✓ | ✓ | History helped |
| 7 | Missing ingredients | ✗ Tabasco missed | ✗ Tabasco missed | Confirmed repeatable failure |
| 8 | Tabasco confirmed | ✓ | ✓ | Only after user self-corrects |
| 9 | Dry marinade/time | ✓ | ✓ | Consistent |
| 10 | Complete ingredient list | ✓ | ✓ | Tabasco present when asked directly |
| 11 | Marinade quantities | ✓ | ✓ | Consistent |
| 12 | Two chili powders | Honest gap | Collapsed into one | History degraded this answer |
| 13 | Frying steps | ✓ | ✓ | Consistent |
| 14 | After the fryer | ✗ Thin | ✓ Improved | History helped |
| 15 | How many sauces | ✗ 2 (wrong) | ✓ 3 (correct) | History fixed this failure |
| 16 | Bourbon usage | ✓ | ✓ | Consistent |
| 17 | Oil temperature | ✓ | ✓ | Consistent |
| 18 | Xiaomila | ✓ | ✓ | Consistent |
| 19 | Frank's Red Hot | ✓ | ✓ | Richer quote with history |
| 20 | Coffee recommendation | ✓ | ✓ | Sponsor ignored both times |
| 21 | Total time | ✓ | ✓ | Consistent |

**Chained: 16 pass, 1 partial, 4 fail/flag**

---

## Key Findings

**1. Tabasco is a confirmed repeatable failure**
Missed in Q7 in both the original conversation and the chained test, despite Tabasco being explicitly named in the transcript's marinade section. Asking for a complete list (Q10) returns it correctly. This is a prompt framing failure: partial-list "am I missing anything?" questions reliably drop Tabasco on this transcript. Chunking the marinade section as a discrete unit would likely fix this.

**2. History helps some answers, hurts others**
- **Helped:** After-fryer answer (Q14) and sauce count (Q15) were both more accurate with history
- **Hurt:** The chili powder distinction (Q12) was correctly flagged as unknown in isolation but actively collapsed into a single ingredient with history — the model over-inferred from context
- **Changed:** The first step answer (Q1) shifted from "blend chilis" to "marinate wings" with history established — neither is clearly right but they contradict each other

**3. Step order is unreliable**
The model does not have a stable understanding of recipe step order for this video. The first step answer changed between isolated and chained sessions. This is a direct consequence of the video's structure — 7 minutes of philosophical discussion precede the first cooking step, making it hard for the model to establish a clear sequence from a flat transcript. Timestamp-aware chunks with section labels (intro / hot sauce base / wing prep / frying / sauce / plating) would give the model a reliable map to reason from.

**4. Sponsor segment is consistently ignored**
Trade Coffee sponsor at 6:00 did not affect any answer in either test. Not a concern at current transcript length.

---

## Remaining Tests (Isolated — no prior history)

**Q22: Walk me through the hot sauce base step by step**
> "1. Blend 85g of millet chilis with 1-2 cloves of garlic and 1/3 cup of water. 2. Pass the mixture through a fine mesh sieve. 3. This strained liquid is your hot sauce base."

**Assessment: ✓ Pass** — correctly isolated the three sub-steps with accurate quantities. Did not bleed into marinade or buffalo sauce steps.

---

**Q23: What's the difference between the hot sauce base and the buffalo sauce?**
> "The hot sauce base is made from blended and sieved millet chilis, garlic, and water. The buffalo sauce is created by combining this hot sauce base with chicken stock/water, milk powder, Tabasco, sugar, rice vinegar, white pepper, MSG, chicken bouillon powder, garlic powder, and then stir-frying it with additional butter, minced garlic, pickled chilies, spicy chili powder, bourbon, and thickened with a starch slurry, then mounted with cold butter."

**Assessment: ✓ Pass** — clearly distinguished the two sauces as separate things. Full sauce ingredient list returned, Tabasco present. No collapsing.

---

**Final score: 18 pass, 1 partial, 4 fail/flag** (Q22 and Q23 both pass in isolation)
