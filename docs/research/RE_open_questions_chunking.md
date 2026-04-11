# Open Questions — Transcript Chunking

**Status:** Living Document
**Date:** 2026-04-11
**Purpose:** Tracks deferred and unresolved questions from the transcript chunking sprint. Questions are closed when a decision is made and recorded in the PRD.

---

## Open

### OQ1 — What `chunkSize` produces the best summaries for recipe content?

**Context:** 1,500 chars is the current starting point, loosely derived from Apify's 200–400 token guidance for transcript RAG pipelines (200–400 tokens ≈ 800–1,600 chars). The Apify source does not explain why 200–400 tokens is optimal for transcripts, and their use case may not match recipe-specific content.

**Why it matters:** Too small → chunk summaries miss context mid-step (e.g. an ingredient list split across two chunks). Too large → summaries become generic and lose precision. The Honey Miso demo produced 6 chunks at 1,500 chars — Chunk 4 was pure narrative filler with no recipe content, which suggests chunks may already be capturing too much non-recipe content per unit.

**How to answer:** Generate real summaries at 1,500 chars and inspect quality. Try 1,000 chars and 2,000 chars as comparison points. Assess whether ingredient lists and cooking steps are captured completely within a single chunk.

---

### OQ2 — What `chunkOverlap` is right for recipe transcripts?

**Context:** 150 chars (~10% of `chunkSize`) is the current value. Per the RCTS source, overlap carries forward whole split units (sentences) until the total drops below the overlap threshold — so the actual overlap will be 1–2 sentences in practice.

**Why it matters:** Overlap exists to prevent losing content at chunk boundaries. For recipe transcripts the main risk is an ingredient or step being split across a boundary mid-sentence. With punctuation-first separators this is rare, so overlap may be less critical here than in general RAG use cases.

**How to answer:** Inspect the overlap regions in real summaries. If no information is being lost at boundaries, the overlap can be reduced. If summaries are missing steps that span boundaries, increase it.

---

### OQ3 — Sponsor segment detection

**Context:** The 6:00 boundary in "How I Stopped Cooking Breakfast Every Day" falls inside a Trade Coffee sponsor read. Sponsor content contains no recipe information and will produce a useless chunk summary if included. At least one confirmed instance across the current library.

**Why it matters:** A chunk summary of a sponsor segment would tell the chat "Trade Coffee ships tailored beans to your door" — irrelevant and potentially misleading if the chat surfaces it in response to a recipe question.

**Blockers to resolving:** No reliable programmatic way to detect sponsor segments without either (a) a separate Gemini call to classify each chunk before summarising, or (b) SponsorBlock API integration. Both add complexity. Deferred to a later phase.

---

### OQ4 — Outro/sign-off detection

**Context:** The 17:00 boundary in Buffalo Wings and the end of Chunk 6 in Honey Miso both contain sign-off content ("Don't forget to like, comment, share, and subscribe"). Same category of noise as sponsor segments — no recipe value.

**Why it matters:** Outro content in a chunk summary would not meaningfully degrade chat answers since it contains no conflicting information. Lower priority than sponsor detection.

**Blockers to resolving:** Same as OQ3. Could be partially mitigated by the map prompt — instructing Gemini to extract only ingredients and cooking steps would cause it to ignore outro content even if present in the chunk.

---

### OQ5 — Map prompt definition

**Context:** F5 defines the map phase as "Summarise each chunk individually via Gemini" but does not specify the prompt. The Honey Miso demo showed that Chunk 4 is pure narrative filler — a generic summarisation prompt would return content like "The chef reflects on short ribs being luxurious" which has no value for chat.

**Why it matters:** The map prompt is the primary lever on summary quality. A recipe-specific prompt ("Extract only ingredients with quantities and cooking steps from this section. If no recipe content is present, return nothing.") would filter filler and sponsor content without needing explicit detection.

**How to answer:** Write and test candidate map prompts against real chunks including a filler chunk (Chunk 4, Honey Miso) and a content-rich chunk (Chunk 3, Honey Miso). Evaluate whether the filler chunk returns empty or near-empty output.

---

### OQ6 — Reduce prompt definition

**Context:** F6 defines the reduce phase as "Combine chunk summaries into a single recipe summary via Gemini" but does not specify the prompt.

**How to answer:** Define alongside OQ5. The reduce prompt should ask Gemini to consolidate the chunk summaries into a structured recipe overview — ingredients and steps in order — suitable for use as chat context.

---
