# Video Control Agent Design

**Status:** Research Complete
**Date:** 2026-04-16
**Purpose:** How does intent classification work in Phase A, and what makes a LangGraph agent the right choice for Phase B — specifically the conditional branch logic that separates seek-to-instruction from simple transport commands?

---

## TL;DR

- **Problem:** Users need to control video playback via natural language. Two very different interactions are involved: discrete commands ("pause") and instruction-based seeks ("skip to where they make the sauce") — and they need different execution models.
- **Phase A:** No separate intent classifier. The LLM's available tools are the classification mechanism. If the user says "pause", the LLM calls `pause_video()`. If they ask a recipe question, it answers normally. One call, two behaviours.
- **Phase B:** A LangGraph conditional edge is justified because seek-to-instruction requires multi-step reasoning with a branch: search chunks → evaluate confidence → either seek or decline. Hard-coding that branch in a Netlify function is brittle; an agent handles it naturally.
- **Key distinction:** Phase A is a single deterministic action. Phase B requires the model to reason about its own confidence before deciding which action to take.

---

## Sequence Diagrams

### Phase A — Transport Commands (play / pause / rewind)

```
┌──────────┐   ┌────────────────┐   ┌───────────────────┐   ┌──────────────┐   ┌───────────────┐
│  User    │   │  RecipePage    │   │  recipe-chat.js   │   │   Gemini     │   │  YouTube      │
│          │   │  (frontend)    │   │  (Netlify fn)     │   │  2.5 Flash   │   │  IFrame API   │
└────┬─────┘   └───────┬────────┘   └────────┬──────────┘   └──────┬───────┘   └──────┬────────┘
     │                 │                      │                     │                  │
     │  "pause the     │                      │                     │                  │
     │   video"        │                      │                     │                  │
     ├────────────────▶│                      │                     │                  │
     │                 │  POST /recipe-chat   │                     │                  │
     │                 │  { message, history} │                     │                  │
     │                 ├─────────────────────▶│                     │                  │
     │                 │                      │  generateContent(   │                  │
     │                 │                      │   messages,         │                  │
     │                 │                      │   tools: [          │                  │
     │                 │                      │    play_video,      │                  │
     │                 │                      │    pause_video,     │                  │
     │                 │                      │    rewind_seconds]) │                  │
     │                 │                      ├────────────────────▶│                  │
     │                 │                      │                     │  (no separate    │
     │                 │                      │                     │  classifier —    │
     │                 │                      │                     │  tool selection  │
     │                 │                      │                     │  IS the intent   │
     │                 │                      │                     │  classification) │
     │                 │                      │                     │                  │
     │                 │                      │  tool_call:         │                  │
     │                 │                      │  pause_video()      │                  │
     │                 │                      │◀────────────────────┤                  │
     │                 │  { toolCall:         │                     │                  │
     │                 │    "pause_video",    │                     │                  │
     │                 │    reply: "Paused."} │                     │                  │
     │                 │◀─────────────────────┤                     │                  │
     │                 │                      │                     │                  │
     │                 │  player.pauseVideo() │                     │                  │
     │                 ├──────────────────────────────────────────────────────────────▶│
     │                 │                      │                     │                  │
     │  "Paused."      │                      │                     │                  │
     │◀────────────────┤                      │                     │                  │
```

**What "intent classification" actually is in Phase A:**
The LLM is not running a separate classification step. The system prompt defines available tools with descriptions. When Gemini sees `pause_video` in its tool list and a message saying "pause the video", it selects that tool. The tool schema IS the classifier — no extra call, no separate model, no regex needed (though a regex pre-filter is an optional optimization to skip the LLM entirely for unambiguous single-word commands).

---

### Phase B — Instruction-Based Seek

```
┌──────────┐   ┌────────────────┐   ┌───────────────────┐   ┌──────────────┐   ┌───────────────┐
│  User    │   │  RecipePage    │   │  LangGraph Agent  │   │   Gemini     │   │  YouTube      │
│          │   │  (frontend)    │   │  (recipe-chat.js) │   │  2.5 Flash   │   │  IFrame API   │
└────┬─────┘   └───────┬────────┘   └────────┬──────────┘   └──────┬───────┘   └──────┬────────┘
     │                 │                      │                     │                  │
     │  "skip to where │                      │                     │                  │
     │  they make      │                      │                     │                  │
     │  the sauce"     │                      │                     │                  │
     ├────────────────▶│                      │                     │                  │
     │                 │  POST /recipe-chat   │                     │                  │
     │                 ├─────────────────────▶│                     │                  │
     │                 │                      │                     │                  │
     │                 │                      │  ── Node: reason ── │                  │
     │                 │                      │  generateContent(   │                  │
     │                 │                      │   messages,         │                  │
     │                 │                      │   tools: [          │                  │
     │                 │                      │    semantic_search, │                  │
     │                 │                      │    seek_to_ms])     │                  │
     │                 │                      ├────────────────────▶│                  │
     │                 │                      │  tool_call:         │                  │
     │                 │                      │  semantic_search(   │                  │
     │                 │                      │  "make the sauce")  │                  │
     │                 │                      │◀────────────────────┤                  │
     │                 │                      │                     │                  │
     │                 │                      │  ── Node: act ──    │                  │
     │                 │                      │  pgvector query     │                  │
     │                 │                      │  → chunks + scores  │                  │
     │                 │                      │                     │                  │
     │                 │                      │  ── Node: observe ──│                  │
     │                 │                      │  tool result back   │                  │
     │                 │                      │  to Gemini:         │                  │
     │                 │                      │  [{ text: "now      │                  │
     │                 │                      │   starting sauce",  │                  │
     │                 │                      │   start_ms: 245000, │                  │
     │                 │                      │   score: 0.91 }]    │                  │
     │                 │                      ├────────────────────▶│                  │
     │                 │                      │                     │                  │
     │                 │                      │  ┌──────────────────────────────────┐  │
     │                 │                      │  │ CONDITIONAL EDGE (Gemini decides)│  │
     │                 │                      │  │ "score 0.91 — confident, I'll    │  │
     │                 │                      │  │  seek" → tool_call: seek_to_ms   │  │
     │                 │                      │  └──────────────────────────────────┘  │
     │                 │                      │                     │                  │
     │                 │                      │  tool_call:         │                  │
     │                 │                      │  seek_to_ms(245000) │                  │
     │                 │                      │◀────────────────────┤                  │
     │                 │                      │                     │                  │
     │                 │                      │  ── Node: act ──    │                  │
     │                 │  player.seekTo(245)  │                     │                  │
     │                 ├──────────────────────────────────────────────────────────────▶│
     │                 │                      │                     │                  │
     │                 │                      │  tool result: ok    │                  │
     │                 │                      ├────────────────────▶│                  │
     │                 │                      │                     │                  │
     │                 │                      │  ── Node: respond ──│                  │
     │                 │                      │  "Jumped to 4:05 —  │                  │
     │                 │                      │   that's where they │                  │
     │                 │                      │   start the sauce." │                  │
     │                 │                      │◀────────────────────┤                  │
     │  "Jumped to     │  { toolCall: seek,   │                     │                  │
     │  4:05 — sauce   │    reply: "...",     │                     │                  │
     │  step."         │    ms: 245000 }      │                     │                  │
     │◀────────────────│◀─────────────────────┤                     │                  │
     │                 │                      │                     │                  │
     │                 │      ──── OR if Gemini evaluates score as too low ────        │
     │                 │                      │                     │                  │
     │                 │                      │  "score 0.31 —      │                  │
     │                 │                      │   not confident,    │                  │
     │                 │                      │   I won't seek"     │                  │
     │                 │                      │◀────────────────────┤                  │
     │  "I couldn't    │  { reply: "Couldn't  │                     │                  │
     │  find that      │    find that step."} │                     │                  │
     │  step."         │◀─────────────────────┤                     │                  │
     │◀────────────────┤                      │                     │                  │
```

---

## Architecture Diagram

How Phase A and Phase B coexist in the same backend:

```
POST /recipe-chat
{ message, recipeId, history }
         │
         ▼
┌─────────────────────┐
│  Intent Pre-screen  │  ← lightweight: is this a video control message?
│  (regex or prompt)  │    "play", "pause", "rewind N", "skip to [X]"
└──────────┬──────────┘
           │
     ┌─────┴──────┐
     │            │
  CONTROL      RECIPE Q&A
  intent       intent
     │            │
     ▼            ▼
┌─────────┐   ┌──────────────────────────────────┐
│ PHASE A │   │  Existing recipe-chat path        │
│ PHASE B │   │  (Gemini call with transcript     │
│ router  │   │   context, conversation history)  │
└────┬────┘   └──────────────────────────────────┘
     │
     ├── Phase A? (play / pause / rewind)
     │       │
     │       ▼
     │   Single Gemini call
     │   with video tool schemas
     │   → returns tool_call + reply
     │   → frontend executes against IFrame API
     │
     └── Phase B? (skip to [instruction])
             │
             ▼
         LangGraph agent
         reason → act (semantic_search)
         → observe (chunks + scores)
         → conditional edge (confident / not)
         → act (seek_to_ms) OR respond (decline)
         → respond (confirmation)
         → returns tool_call (if seek) + reply
         → frontend executes against IFrame API
```

---

## Data Flow Diagram — Phase B Conditional Edge

The conditional edge is what justifies the agent. This is the branch logic that would be hard-coded and brittle in a plain function:

```
semantic_search("make the sauce")
         │
         ▼
  chunks: [{ text, start_ms, score }, ...]
         │
         ▼
  best_score = max(scores)
         │
    ┌────┴────┐
    │         │
score        score
>= 0.7       < 0.7
    │         │
    ▼         ▼
seek_to_ms  generate decline reply
(best chunk  "I couldn't find that
 start_ms)   step. Try rephrasing
             or check the recipe
             steps manually."
    │         │
    └────┬────┘
         ▼
  generate confirmation reply
  (only if seek path):
  "Jumped to 4:05 — that's where
   they start the sauce."
```

---

## Problem vs Solution

### Phase A: Why no separate classifier?

| Approach | How it works | Tradeoffs |
|----------|-------------|-----------|
| Separate intent classifier | Extra LLM call first: "Is this a video command or a recipe question?" Then route. | Doubles latency for every message. Overkill — Gemini already does this implicitly via tool selection. |
| Regex pre-filter | Keyword match before hitting the LLM: "pause" → call `pause_video()` directly, skip LLM. | Fast and free. Works for obvious single-word commands. Fails on natural phrasing ("can you stop the video for a sec"). |
| Tool-bearing LLM call (recommended) | LLM receives tool schemas for video controls + recipe Q&A system prompt in one call. Tool selection IS classification. | One call, handles natural phrasing, no extra latency. Classification cost is zero because it happens inside the existing LLM call. |

**Recommended:** Tool-bearing LLM call for all messages. Optionally add a regex pre-filter as a fast path for obvious commands (`/^(play|pause|stop)$/i`) to skip the LLM call entirely for the most common cases.

---

### Phase B: Why agent and not a plain function?

| Approach | How it works | Why it breaks down |
|----------|-------------|-------------------|
| Hard-coded function | Netlify function: call `pgvector`, check `score > threshold`, return `seek` or `decline`. | Works for simple cases. Breaks when: user query is ambiguous, multiple chunks match, score threshold needs explanation, or you need to combine constraints ("near the beginning, when they season it"). No ability to reason. |
| Single LLM call with tools | Pass chunks as context, ask LLM to pick the right one and return a tool call. | Works for simple cases. But if chunks are large and numerous, every turn re-passes all chunk text as tokens. No loop = no ability to retry a bad search with a rephrased query. |
| LangGraph ReAct agent (recommended) | Agent runs a reason-act-observe loop. It decides what to search, evaluates what comes back, branches on confidence, and composes a contextual response. | Adds ~200–400ms per node. Justified because: conditional branch logic lives in the model (not brittle code), agent can rephrase and retry a failed search, and response quality is higher (model explains *why* it's seeking or declining). |

---

## Side-by-Side: What the LLM actually "sees"

### Phase A — Tool schema approach (no classifier prompt needed)

```javascript
// Tools passed to Gemini in the API call
const videoTools = [
  {
    name: "pause_video",
    description: "Pauses the recipe video that is currently playing.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "play_video",
    description: "Resumes playback of the recipe video.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "rewind_seconds",
    description: "Rewinds the video by a specified number of seconds.",
    parameters: {
      type: "object",
      properties: {
        seconds: { type: "number", description: "Number of seconds to rewind. Defaults to 30." }
      }
    }
  }
];

// System prompt does NOT say "if user says pause, call pause_video"
// The tool description alone is enough — Gemini selects the right tool
// based on the user message semantics
```

### Phase B — LangGraph node + conditional edge (pseudocode)

```javascript
// The agent graph has nodes and conditional edges
const agentGraph = new StateGraph(AgentState)
  .addNode("reason", reasoningStep)        // LLM decides what to do
  .addNode("search", semanticSearchTool)   // calls pgvector
  .addNode("evaluate", evaluateChunks)     // scores chunks, picks best
  .addNode("seek", seekToTimestamp)        // calls seek_to_ms
  .addNode("respond", generateReply)       // final user-facing message

  // Conditional edge: after evaluate, branch on confidence
  .addConditionalEdges("evaluate", (state) => {
    return state.bestScore >= 0.7 ? "seek" : "respond";
  })

  .addEdge("reason", "search")
  .addEdge("search", "evaluate")
  .addEdge("seek", "respond")   // seek always leads to a confirmation reply
  .setEntryPoint("reason");

// The conditional edge is what would be hard-coded in a plain function.
// In the agent, the branch condition can also be handled by the model itself
// (model reasons: "I don't have high confidence here, I won't seek").
```

---

## Real-World Examples

**Jockey (Twelve Labs + LangChain)** — the primary public example of a LangGraph video agent. Uses a supervisor node that routes between specialized workers: video-search, video-editing, text-generation. Each worker runs tools, observes results, and routes back to the supervisor. The conditional routing between workers is exactly the same pattern as Phase B's seek-vs-decline branch. Source: https://blog.langchain.com/jockey-twelvelabs-langgraph/

**Gemini structured tool calling** — Google's documentation for Phase A style tool use: pass tool schemas, LLM selects and calls them, you execute on the client. No separate intent classifier — tool selection is the classification. Source: https://ai.google.dev/gemini-api/docs/function-calling

**Anthropic Programmatic Tool Calling** — relevant context: Anthropic's newer model (2026) can write Python code to call tools rather than emitting JSON tool calls. For Phase B this could eliminate the LangGraph boilerplate — Claude writes code that calls `semantic_search()`, evaluates confidence, and conditionally calls `seek_to_ms()` in a single execution round. Worth revisiting when Phase B is implemented. Source: https://www.anthropic.com/engineering/advanced-tool-use

---

## Sources

- Jockey architecture post: https://blog.langchain.com/jockey-twelvelabs-langgraph/
- Gemini function calling docs: https://ai.google.dev/gemini-api/docs/function-calling
- LangGraph conditional edges: https://langchain-ai.github.io/langgraph/concepts/low_level/#conditional-edges
- Anthropic Programmatic Tool Calling: https://www.anthropic.com/engineering/advanced-tool-use
- Gemini Live tool use: https://ai.google.dev/gemini-api/docs/live-api/tools
