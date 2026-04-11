# Transcript Boundary Analysis — All Recipes

**Status:** Research Complete
**Date:** 2026-04-10
**Purpose:** Assess transcript quality, length, and minute-boundary cut points across all 20 recipes to inform the chunking strategy in the transcript chunking PRD.

---

## 1. Full Recipe Inventory

| # | Title | Duration | ~Tokens | Transcript | Supadata Segments |
|---|-------|----------|---------|------------|-------------------|
| 1 | Everyone should know how to make this classic | 0:36 | 231 | ✓ | ✓ |
| 2 | Lobster Ravioli | 0:54 | 225 | ✓ | ✓ |
| 3 | I forgot about this childhood dessert | 1:00 | 297 | ✓ | ✓ |
| 4 | It's ok bro, I made one for you… | 1:32 | 379 | ✓ | ✓ |
| 5 | Crème this brûlée | — | 381 | ✓ | ✗ |
| 6 | There is no better meal than this one | 0:41 | 242 | ✓ | ✓ |
| 7 | Teriyaki chicken & veggie one pan meal!! | 0:32 | 114 | ✓ | ✓ |
| 8 | Sheet Pan Chicken Kefta | — | 0 | ✗ | — |
| 9 | What this dietitian with IBS eats for dinner | 0:40 | 248 | ✓ | ✓ |
| 10 | These disappear so fast! Low Carb Mini Soft Tacos | 0:56 | 308 | ✓ | ✓ |
| 11 | Honey Miso Short Rib | 8:43 | 1,930 | ✓ | ✓ |
| 12 | Why China hates Buffalo Wings (and how to fix it) | 17:20 | 3,855 | ✓ | ✓ |
| 13 | Always the first thing gone from the table | 0:29 | 179 | ✓ | ✓ |
| 14 | I used to think I hate lamb until making this | 0:40 | 225 | ✓ | ✓ |
| 15 | Chipotle Chicken Linguini | 1:00 | 385 | ✓ | ✓ |
| 16 | How I Stopped Cooking Breakfast Every Day | 6:22 | 1,922 | ✓ | ✓ |
| 17 | Bibimbap Was Never Meant to Be Fancy | — | 0 | ✗ | — |
| 18 | STROMBOLI BUT MAKE IT BUFFALO-STYLE | — | 0 | ✗ | — |
| 19 | Spicy Joy Jollibee Fried Chicken | 1:17 | 448 | ✓ | ✓ |
| 20 | Homemade Cinnamon Roll Toast? Let's Try It! | 1:55 | 220 | ✓ | ✓ |

**Gaps identified:**
- 3 recipes have no transcript stored: Sheet Pan Chicken Kefta, Bibimbap, STROMBOLI. These need re-enrichment before chunking is possible.
- 1 recipe (Crème this brûlée) has a stored transcript but Supadata returns no segments — the video may be private or unavailable. The stored transcript cannot be used for timestamp-aware chunking.

---

## 2. Short Videos — No Chunking Required (<1 min, 0 boundaries)

These are all YouTube Shorts. No minute boundaries exist so no chunking is needed. Chat uses the full stored transcript directly.

| Title | Duration | ~Tokens |
|-------|----------|---------|
| Everyone should know how to make this classic | 0:36 | 231 |
| Lobster Ravioli | 0:54 | 225 |
| There is no better meal than this one | 0:41 | 242 |
| Teriyaki chicken & veggie one pan meal!! | 0:32 | 114 |
| What this dietitian with IBS eats for dinner | 0:40 | 248 |
| These disappear so fast! Low Carb Mini Soft Tacos | 0:56 | 308 |
| Always the first thing gone from the table | 0:29 | 179 |
| I used to think I hate lamb until making this | 0:40 | 225 |

**Gaps identified:** None — these are all within safe context window limits and require no chunking.

---

## 3. Medium Videos — 1 Boundary (1–2 min)

These videos cross one minute boundary. Chunking is not strictly needed at current token counts, but the boundary cuts are still useful as evidence for choosing a sentence-aware chunking strategy.

### I forgot about this childhood dessert (1:00)

| Boundary | Cut |
|----------|-----|
| 1:00 | "...Just chestnut puree with cold whipped cream. It tastes earthy, a little sweet, / and a little bit like pure joy...." |

**Assessment:** Awkward — mid-sentence.

---

### It's ok bro, I made one for you… (1:32)

| Boundary | Cut |
|----------|-----|
| 1:00 | "...little bit of flour for security. and bake at 420 degrees for 12 minutes. / Guys, I'm not playing with the desserts. These just came out. This is the right..." |

**Assessment:** Relatively clean — cuts after a complete cooking instruction ("bake at 420 degrees for 12 minutes"). One of only two clean cuts in the entire dataset.

---

### Chipotle Chicken Linguini (1:00)

| Boundary | Cut |
|----------|-----|
| 1:00 | "...with a little bit more snow and then just greens to negate all those / calories...." |

**Assessment:** Awkward — cuts mid-phrase ("all those / calories").

---

### Spicy Joy Jollibee Fried Chicken (1:17)

| Boundary | Cut |
|----------|-----|
| 1:00 | "...Time for a hot bubble bath. We're aiming for 350. After 10 to 12 minutes, you / should have golden brown actual perfection. At a single burn mark,..." |

**Assessment:** Awkward — cuts mid-sentence ("After 10 to 12 minutes, you / should have golden brown").

---

### Homemade Cinnamon Roll Toast? Let's Try It! (1:55)

| Boundary | Cut |
|----------|-----|
| 1:00 | "...So [snorts] putting these in the air fryer. / I don't know why I'm so nervous...." |

**Assessment:** Awkward — cuts mid-thought.

**Gaps identified:** 4 of 5 medium video cuts are awkward. Only 1 is clean, and only by coincidence (instruction ended naturally at the boundary). Confirms that fixed-time cuts cannot be relied upon even for short videos.

---

## 4. Long Videos — Chunking Required

### Honey Miso Short Rib (8:43, ~1,930 tokens)

| Boundary | Cut | Assessment |
|----------|-----|------------|
| 1:00 | "...the bone. it'll add to that broth. But I don't know. I just like having more / surface area to sear up that's actually [music] meat. It's just simpler. It's..." | Awkward — mid-sentence |
| 2:00 | "...miso honey glaze that we're going to be creating. So, we'll give this a couple / more minutes to just sear up a bit. All right, so while we're finishing up our..." | Awkward — mid-sentence |
| 3:00 | "...base of our sauce. So, we have our garlic, / we have our shallot, and toss in our ginger,..." | Awkward — mid-ingredient list |
| 4:00 | "...And also our dark soy sauce. All right. And last, we have our honey / and two star. [music] We'll go ahead and give that up a stir...." | Awkward — mid-ingredient ("honey / and two star anise") |
| 5:00 | "...think about those like really nice date night [music] dinners or, you know, even / if you're cooking for yourself, you should have something luxurious. And so,..." | Awkward — mid-sentence |
| 6:00 | "...All right. Let's set these aside. All right. So, we have our beautiful, / beautiful broth [music] and sauce that is about to be made out of this here. We..." | Awkward — mid-phrase |
| 7:00 | "...of a boil. [music] And we're going to be ready to start plating this up. All / right, our cornstarch goes in. [music]..." | Awkward — "All right" split across boundary |
| 8:00 | "...We're just going to place [music] those right in the center. Two per person. / Don't be shy. Then, we're going to take some of that sauce,..." | Awkward — mid-thought |

**Clean cuts: 0 of 8**

**Gaps identified:** 8 of 8 cuts are awkward. The 4:00 cut is the worst — it splits "honey" and "two star anise" into separate chunks, which would cause the chat to miss an ingredient entirely if those chunks were summarised independently. Noise (`[music]`) appears in 5 of 8 boundaries. Stripping noise before chunking is essential.

---

### How I Stopped Cooking Breakfast Every Day (6:22, ~1,922 tokens)

| Boundary | Cut | Assessment |
|----------|-----|------------|
| 1:00 | "...so sometimes I'll do 4 tablespoons of bourbon or Licor43. Some people see this as a bizarre move, / and they make sure to let me know that, but vanilla extract is 70-proof just like vodka is..." | Awkward — mid-sentence |
| 2:00 | "...it's also why I / didn't pre-heat the oven, despite the instructions of the original recipe..." | Awkward — mid-sentence ("it's also why I / didn't pre-heat") |
| 3:00 | "...take a couple tablespoons of coarse sugar and sprinkle it on top of the assembled mixture. The / sweetness will be more localized and more likely to bake into a crunchy top layer..." | Awkward — mid-sentence ("The / sweetness") |
| 4:00 | "...When it's done you do have to let it rest / for 15 minutes which brings the total cook time over an hour..." | Awkward — mid-sentence ("let it rest / for 15 minutes") |
| 5:00 | "...no protein-maxed version with whey powder and sugar replacements. Let this / then be a good gateway for the oat-curious..." | Awkward — mid-sentence |
| 6:00 | "...And the bean bags that do make their way to your kitchen will be tailored to your personal tastes, / not just determined by an algorithm or at random..." | Awkward — mid-sentence (also: this is a sponsor segment, not recipe content) |

**Clean cuts: 0 of 6**

**Gaps identified:** 6 of 6 cuts are awkward. Notable additional gap: the 6:00 boundary falls inside a **sponsor read** (Trade Coffee), not recipe content. This is a category of noise that stripping `[music]` tags alone will not catch. Sponsor segments need to be identified and excluded from chunking.

---

### Why China hates Buffalo Wings (and how to fix it) (17:20, ~3,855 tokens)

| Boundary | Cut | Assessment |
|----------|-----|------------|
| 1:00 | "...those two respective dishes were our first introduction to, well, flavor. Like for me, back when I was 17... / those two respective dishes were our first introduction..." | Awkward — mid-anecdote |
| 2:00 | "...you'll find it to be true, too. And that is the very base of a buffalo sauce. / The canonical hot sauce for an authentically correct buffalo, Frank's Red Hot, is completely..." | Awkward — mid-argument |
| 3:00 | "...Maybe this is another one of those cases of the MBA crowd taking / an American food product, running it straight into the ground..." | Awkward — mid-sentence |
| 4:00 | "...is actually one of the perfect gateway / spicy foods. But now I want you to picture the average Chinese spicy food enthusiast..." | Awkward — mid-phrase ("gateway / spicy foods") |
| 5:00 | "...So in this video, what I decided to do was try to rebuild a new better buffalo / wing from first principles..." | Awkward — mid-phrase ("buffalo / wing") |
| 6:00 | "...Now, Franks is, of course, an American-style fermented hot sauce. / Now, before I could easily get Frank's here..." | Relatively clean — paragraph break |
| 7:00 | "...the remainder of our buffalo sauce is going to be a / conspiracy to balance that heat. So, what we'll do is we'll blend 85g..." | Awkward — mid-sentence |
| 8:00 | "...this is not that stable of a concoction. / Like I want to toss wings in a sauce while they're still piping hot from deep frying..." | Awkward — mid-argument |
| 9:00 | "...But by that point, the sauce, it ends up losing much of the spiciness that we've worked so hard / for. And importantly, also for the Chinese palette..." | Awkward — mid-sentence |
| 10:00 | "...So, here we've got 15 wings. And of course, the authentic move for an American-style hot wing / is definitely to fry them naked..." | Awkward — mid-sentence |
| 11:00 | "...just 10 grams each of water and cornstarch. And then mix that super super well with the wings. / Then we'll get a wok of oil up to about 120 Celsius..." | Relatively clean — step boundary |
| 12:00 | "...one last final thing before we stir fry. Everything up to now, / it was all pretty tasty. I liked it..." | Awkward — mid-thought |
| 13:00 | "...because it's used for dips. The character Shuan in Chinese, it means 'dip' or 'swish' maybe? And / so this thing, it's literally called swish swish spicy..." | Awkward — mid-explanation |
| 14:00 | "...pour a tablespoon of bourbon over the spatula and around the side of the wok. Quick mix, sauce in. And once that's at a light boil, / swap the flame down to low and drizzle in a slurry..." | Relatively clean — step boundary |
| 15:00 | "...which honestly is a fantastic combination - might actually be the best idea of this entire exercise. / But besides that, of course, we'll also have the mandatory side of celery..." | Relatively clean — natural pause |
| 16:00 | "...give these a go? Hang on. Let's uh you're not short. I'm just so tall. Everybody, let's see. / ..." | Awkward — mid-sentence, appears to be banter |
| 17:00 | "...Anyway, real normal Chinese recipe coming out next week…ish? Uh, / in the meantime, thank you for everyone that's supporting us..." | Awkward — outro/sign-off, not recipe content |

**Clean cuts: 4 of 17** (6:00, 11:00, 14:00, 15:00)

**Gaps identified:** 13 of 17 cuts are awkward. The 4 clean cuts all happen to land near natural step or paragraph boundaries — confirming that sentence-aware splitting would produce significantly better results than fixed-time cuts. At 17:20 this is by far the longest video in the library and will produce the largest summaries. The 17:00 boundary falls in the **outro/sign-off** — outro content should be excluded from chunking as it contains no recipe information.

---

## 5. Final Summary

### By the numbers

| Category | Count |
|----------|-------|
| Total recipes | 20 |
| No transcript | 3 |
| Supadata segments unavailable | 1 |
| Short videos — no chunking needed (<1 min) | 8 |
| Medium videos — 1 boundary (1–2 min) | 5 |
| Long videos — chunking required (>6 min) | 3 |
| Total boundary cuts analysed | 36 |
| Clean cuts | 5 (14%) |
| Awkward cuts | 31 (86%) |

### Key gaps

**1. Missing transcripts (3 recipes)**
Sheet Pan Chicken Kefta, Bibimbap, and STROMBOLI have no transcript stored. These need to be re-enriched before chunking can be applied.

**2. Supadata segments unavailable (1 recipe)**
Crème this brûlée has a stored transcript but Supadata returns no segments — the video may be private or deleted. Timestamp-aware chunking is not possible. The stored transcript can still be used for chat as-is.

**3. Fixed-time cuts are unreliable (86% failure rate)**
Only 5 of 36 minute boundaries produce a clean cut, and all 5 are coincidental — not due to the chunking strategy. Hard time-based cuts must not be used. A sentence-aware approach (snapping to the nearest sentence end before each boundary) is the minimum requirement.

**4. Noise is pervasive**
`[music]` tags appear at multiple boundaries across all long videos. Stripping noise tokens before chunking is essential and already captured in the PRD (F1).

**5. Sponsor segments (1 confirmed)**
The 6:00 boundary in "How I Stopped Cooking Breakfast Every Day" falls inside a Trade Coffee sponsor read. Sponsor content contains no recipe information and will degrade chunk summaries if included. A future improvement would detect and exclude sponsor segments — not in scope for Phase 1 but worth noting.

**6. Outro contamination (1 confirmed)**
The 17:00 boundary in the Buffalo Wings video falls in the sign-off outro. Outro content ("thank you for supporting us") has no recipe value. Same future improvement as sponsor detection.

**7. The chunking threshold of 5,000 chars is appropriate**
Real character counts confirm a clean gap — short videos top out at 1,790 chars (Spicy Joy Jollibee), long videos start at 7,686 chars (Breakfast). The 5,000 char threshold sits well inside this ~5,900 char gap with no ambiguous middle ground. Implemented as `transcript.length > 5000`.
