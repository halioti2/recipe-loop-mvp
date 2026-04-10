# LangChain Integration Proposals

**Status:** Research Complete
**Date:** 2026-04-10
**Purpose:** What are the viable ways to integrate LangChain/LangGraph into Recipe Loop, and which features do they unlock?

---

## TL;DR

- **Problem:** The current chat assistant makes a single direct Gemini call with the full transcript. This breaks on long videos and limits reasoning to one-shot responses with no tool use.
- **Current:** `recipe-chat.js` — raw fetch to Gemini API, full transcript as context, no memory beyond manually passed history array.
- **Recommendation:** Phase LangChain in — chunking first to fix the context window problem, then LangGraph for smarter multi-step reasoning.
- **Decision:** Transcript chunking (Phase 1) is a prerequisite for the LangGraph agent (Phase 2). Short videos continue using full transcript directly.

---

## Proposed Integrations

### 1. Transcript Chunking — LangChain Map-Reduce Chain
**Problem it solves:** Transcripts for 25+ min videos exceed Gemini's context window.

**How it works:**
```
Full transcript
  → Split into 2–3 min time-based chunks
  → Summarise each chunk (LangChain map step)
  → Merge summaries into a single context (reduce step)
  → Chat uses merged summary instead of raw transcript
```

**Feature unlocked:** Long video support (25+ min recipes work the same as short ones)

---

### 2. LangGraph ReAct Agent — Cooking Chat Assistant
**Problem it solves:** Single-shot Gemini calls can't reason across multiple steps or look up structured data mid-response.

**How it works:**
```
User question
  → Agent reasons: what do I need to answer this?
  → Agent calls tool (ingredient lookup / step navigator)
  → Agent observes result
  → Agent loops if needed, then responds
```

**Tools proposed:**
| Tool | What it does |
|------|-------------|
| Ingredient lookup | Queries the structured `ingredients` array for a recipe |
| Step navigator | Retrieves a specific cooking step by number or keyword from transcript chunks |

**Feature unlocked:** Multi-step reasoning ("what can I sub for butter in the sauce step?"), grounded answers over structured recipe data

---

### 3. Cross-Recipe Intelligence — RAG with pgvector *(Future)*
**Problem it solves:** Agent can only answer about one recipe at a time.

**How it works:**
```
Embed all transcript chunks → store in Supabase pgvector
User asks cross-recipe question → semantic search over embeddings
Agent reasons over top-k results → responds
```

**Feature unlocked:** "What can I cook tonight with what's in my fridge?" across the full recipe library

---

### 4. Grocery Categorisation — Structured Output Chain *(Future)*
**Problem it solves:** Ingredients are listed in recipe order, not grouped by store section.

**How it works:**
```
Raw ingredient list → LangChain structured output chain → categorised by store section (produce, dairy, meat, etc.)
```

**Feature unlocked:** Grocery list sorted by store aisle

---

## Build Order

```
Transcript chunking (fixes context window)
  └── LangGraph ReAct agent (builds on reliable full-context transcripts)
        └── Cross-recipe RAG (builds on embeddings of chunk summaries)
              └── Grocery categorisation (standalone, can ship anytime)
```

---

## Problem vs Solution

| Feature | Without LangChain | With LangChain |
|---------|------------------|----------------|
| Long videos (25+ min) | Transcript truncated, answers miss key info | Full coverage via map-reduce chunking |
| Complex questions | One-shot answer, may miss context | Agent loops with tool calls until complete |
| Cross-recipe questions | Not possible | RAG over embedded chunk summaries |
| Grocery sorting | Manual or single prompt (unreliable) | Structured output chain with typed schema |
