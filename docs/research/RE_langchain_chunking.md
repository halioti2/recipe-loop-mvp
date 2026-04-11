# LangChain Chunking & Summarization — Plain English Explainer

**Status:** Research Complete
**Date:** 2026-04-10
**Purpose:** How does LangChain chunking actually work, and how would it apply to Recipe Loop transcripts?

---

## TL;DR

- **Problem:** A 25 min recipe video has a transcript too long to fit in Gemini's context window in one shot, so the chat either truncates it or errors out.
- **Current:** `recipe-chat.js` passes the full raw transcript directly to Gemini. Works fine for short videos, breaks for long ones.
- **Recommendation:** Use LangChain's `RecursiveCharacterTextSplitter` to break transcripts into overlapping chunks, then use a map-reduce chain to summarise each chunk. Store the final summary in Supabase alongside the recipe. Chat uses the summary instead of the raw transcript for long videos.
- **Decision:** RecursiveCharacterTextSplitter + map-reduce is the right approach for Recipe Loop. Separators should be configured to start with sentence-ending punctuation (`". "`, `"? "`, `"! "`) rather than the default paragraph/line-break chain — this produces clean sentence-boundary cuts on recipe transcripts. Semantic chunking (splitting by meaning) has limited JavaScript support and is much slower — not worth the complexity at this stage.

---

## The Problem In Plain English

Imagine printing out the transcript of a 30 min cooking video. It might be 15,000 words. If you handed that entire printout to someone and said "answer questions about this recipe", they'd struggle — it's too much to hold in their head at once.

Gemini has the same problem. Every AI model has a **context window** — a limit on how much text it can process in one request. When a transcript is too long, you have to summarise it first.

---

## Step 1: Splitting (Chunking)

LangChain's `RecursiveCharacterTextSplitter` breaks the transcript into smaller pieces. By default it splits on paragraph breaks, then line breaks, then spaces — but the separator list is fully configurable. For recipe transcripts, separators should start with sentence-ending punctuation so cuts always land at sentence boundaries:

```js
const splitter = new RecursiveCharacterTextSplitter({
  separators: [". ", "? ", "! ", " ", ""],
  chunkSize: 1500,
  chunkOverlap: 150,
  keepSeparator: true,
});
```

It works like this:

```
Full transcript
  → Try to split on sentence endings (". ", "? ", "! ") first
  → If still too big, split on spaces (words)
  → Keep going until each piece is small enough
```

**The overlap trick:** Each chunk shares ~200 characters with the next one. This means if an ingredient list gets cut in the middle, the next chunk starts a bit before the cut — so nothing gets lost at the boundary.

```
Chunk 1: "...add 2 tbsp olive oil, then finely chop the garlic and add"
Chunk 2: "and add the garlic to the pan along with 1 tsp of thyme..."
                ↑ overlap region — "and add the garlic" appears in both
```

This directly solves the "cut mid-ingredient" problem.

---

## Step 2: Summarising Each Chunk (Map Phase)

Each chunk is sent to Gemini separately with a prompt like:

> "Summarise the key ingredients and cooking steps mentioned in this section of the recipe transcript."

Because chunks are small, each one fits easily in the context window. The summaries come back in parallel — Gemini processes all chunks at the same time.

```
Chunk 1 → Gemini → "Sauté onions in olive oil for 5 min. Add garlic."
Chunk 2 → Gemini → "Add thyme and cook for 2 min. Season with salt."
Chunk 3 → Gemini → "Transfer to oven at 375°F for 20 min."
```

---

## Step 3: Combining the Summaries (Reduce Phase)

All the mini-summaries are joined together and sent to Gemini one more time:

> "Combine these section summaries into a single recipe overview."

The result is a compact, complete summary of the full recipe — everything the chat needs to answer questions accurately, in a size that fits the context window.

---

## Full Flow for Recipe Loop

```
Enrich pipeline runs on a new recipe
  │
  ├─ Transcript is short (<5,000 chars)?
  │   └─ Store as-is. Chat uses it directly. Done.
  │
  └─ Transcript is long (≥5,000 chars)?
      ├─ Split into overlapping chunks (RecursiveCharacterTextSplitter)
      ├─ Summarise each chunk in parallel (map)
      ├─ Combine summaries into one (reduce)
      └─ Store combined summary in `recipes.transcript_summary`
          Chat uses summary instead of raw transcript for long videos.
```

---

## Why Not Semantic Chunking?

Semantic chunking splits by meaning rather than character count — it generates an embedding for every sentence and splits where the meaning changes significantly. This sounds ideal for recipes (split between "ingredients section" and "cooking steps") but:

- Requires embedding every sentence, which is slow and adds API cost
- LangChain's semantic chunker has **limited JavaScript support** (it's primarily a Python feature)
- The punctuation-first separator config in RecursiveCharacterTextSplitter achieves similar boundary safety without the complexity

Semantic chunking is worth revisiting when we add vector search (Phase 3 in the roadmap), but RecursiveCharacterTextSplitter is the right call for now.

---

## Industry Consensus on Transcript Chunking

No publicly documented recipe video chatbot exists to draw a direct comparison from. However, research across transcript-based RAG systems converges on the same approach we've proposed:

> **RecursiveCharacterTextSplitter with overlap is the recommended strategy for video transcript RAG pipelines. Specific parameters vary by source and require tuning for your content.**

What each source actually recommends for chunk size and overlap:

| Source | Chunk Size | Overlap |
|--------|-----------|---------|
| Weaviate | 512 tokens (starting point) | 50–100 tokens |
| Pinecone | 128–1,024 tokens (test and iterate) | Not specified |
| Unstructured | ~250 tokens (~1,000 chars) | Tunable, validate empirically |
| Apify (transcripts specifically) | 200–400 tokens | 20–40 tokens |

**For Recipe Loop:** Apify's transcript-specific guidance (200–400 tokens, 20–40 token overlap) is the closest match to our use case and the most directly applicable starting point. These are starting values — the right numbers will need tuning once we have real data.

Other key findings:
- Semantic chunking is not recommended for transcripts — the embedding cost per sentence is too high and the quality gain doesn't justify it at this stage
- **Strip noise before chunking** — YouTube auto-captions include `[Music]`, `[Applause]` tags and timestamps that pollute chunk summaries if left in
- **Parent-child chunking** (store small chunks for retrieval, larger parent chunks for context) is flagged as a future optimisation worth revisiting when we add vector search
- Chunking strategy is described as "the single biggest lever on RAG performance" — making the overlap parameter especially important to tune once we have real data (Weaviate)

---

## Sources
- [LangChain JS — RecursiveCharacterTextSplitter](https://js.langchain.com/docs/how_to/recursive_text_splitter/)
- [LangChain JS — Summarization Tutorial](https://js.langchain.com/docs/tutorials/summarization/)
- [YouTube Transcripts for LLM and RAG Pipelines — Apify](https://use-apify.com/blog/youtube-transcripts-llm-rag-pipelines-2026)
- [Chunking Strategies for RAG — Weaviate](https://weaviate.io/blog/chunking-strategies-for-rag)
- [Chunking Strategies — Pinecone](https://www.pinecone.io/learn/chunking-strategies/)
- [Chunking for RAG Best Practices — Unstructured](https://unstructured.io/blog/chunking-for-rag-best-practices)
- [Chunking Strategies for RAG with LangChain — IBM](https://www.ibm.com/think/tutorials/chunking-strategies-for-rag-with-langchain-watsonx-ai)
