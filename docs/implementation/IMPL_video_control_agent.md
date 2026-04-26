# Video Control Agent — Implementation

**PRD:** `docs/planning/PRD_video_control_agent.md`
**Research:** `docs/research/RE_video_control_agent_design.md`, `docs/research/RE_voice_video_audio_interference.md`
**Scope:** Let users control the recipe video through natural-language chat. Three phases: (A) IFrame Player API + transport tools driven by a single Gemini tool-calling round, (B) instruction-based seek reading the full timestamped transcript, (C) LangGraph ReAct agent with `semantic_search` over chunked transcripts once `PRD_langchain_chat.md` Phase 2 lands. Phases A and B are self-contained and shippable without LangChain/LangGraph.

---

## Functional Requirements Covered

| # | Requirement | Phase | Status |
|---|-------------|-------|--------|
| V1 | Replace `<iframe>` with YouTube IFrame Player API instance — expose `playVideo()`, `pauseVideo()`, `seekTo()` | A | Todo |
| V2 | Agent tool: `play_video` — resumes playback | A | Todo |
| V3 | Agent tool: `pause_video` — pauses playback | A | Todo |
| V4 | Agent tool: `rewind_seconds(n)` — seeks to `currentTime - n` (default 30, clamped ≥0) | A | Todo |
| V5 | Agent tool: `seek_to_seconds(n)` — absolute seek primitive reused by Phase B | A | Todo |
| V6 | Assistant reply confirms the action ("Rewound 30 seconds.") — no recipe text | A | Todo |
| S1 | Store transcripts with inline `[MM:SS]` timestamps in `playlist-enrich-processor.js` — existing recipes re-enriched | B | Todo |
| S2 | Agent tool: `seek_to_instruction(query)` — Gemini reads full timestamped transcript, returns a `seek_to_seconds` tool call | B | Todo |
| S3 | If Gemini cannot identify a matching moment with confidence, reply with a decline instead of guessing | B | Todo |
| S4 | Assistant confirms the seek ("Jumped to 4:32 — that's where they start the sauce.") | B | Todo |
| C1 | Migrate `seek_to_instruction` to a LangGraph ReAct agent that calls `semantic_search(query)` over `transcript_chunks` | C | Todo |
| C2 | Agent evaluates chunk match confidence and either seeks or declines with a suggestion | C | Todo |
| C3 | Backend falls back to Phase B full-transcript path for recipes that have not yet been chunked | C | Todo |

---

## Out of Scope

| # | Requirement | Reason |
|---|-------------|--------|
| OS1 | Fast-forward / skip-ahead by N seconds | PRD out of scope — rewind is the cooking use case |
| OS2 | Volume control via chat | PRD out of scope |
| OS3 | Playback speed control | PRD out of scope |
| OS4 | Cross-recipe video navigation | PRD out of scope — single-recipe agent only |
| OS5 | Video control on pages other than Recipe Detail | PRD out of scope |
| OS6 | Streaming agent responses token-by-token | Not needed — tool calls return structured output |

---

## Files to Create / Modify

| File | Phase | Action |
|------|-------|--------|
| `src/hooks/useYouTubePlayer.js` | A | Create — wraps IFrame Player API, exposes player ref + control callbacks |
| `src/pages/RecipePage.jsx` | A | Modify — replace `<iframe>` with `<div>` mount point, wire `useYouTubePlayer`, execute tool calls, render confirmation messages |
| `netlify/functions/recipe-chat.js` | A | Modify — add video tool schemas, return `tool_call` field alongside `answer` |
| `netlify/functions/__tests__/recipe-chat.test.js` | A | Modify — add tests for tool-call responses (play / pause / rewind) |
| `scripts/reenrich-with-timestamps.js` | B | Create — one-shot script that re-runs enrichment for existing recipes to populate timestamped transcripts |
| `netlify/functions/playlist-enrich-processor.js` | B | Modify — store transcripts as `[MM:SS] text` (map over Supadata `offset`) |
| `netlify/functions/recipe-chat.js` | B | Modify — add `seek_to_instruction` tool, include timestamped transcript in system prompt |
| `netlify/functions/recipe-chat.js` | C | Modify — branch to LangGraph agent when `transcript_chunks` present; fall back to Phase B otherwise |
| `netlify/functions/video-seek-agent.js` | C | Optional — extract LangGraph agent into its own function if `recipe-chat.js` grows unwieldy (decision deferred, see §Open Questions) |

---

## Key Reuse

| Source | What to reuse |
|--------|--------------|
| `netlify/functions/recipe-chat.js` lines 1–46 | Existing Gemini call path — extend with `tools` field rather than rewriting |
| `netlify/functions/recipe-chat.js` lines 5–9 | CORS headers block — unchanged across all phases |
| `src/hooks/useVoiceMode.js` | Hook structure (`useState` + `useRef` + `useCallback` + returned object) — `useYouTubePlayer` follows the same shape |
| `src/pages/RecipePage.jsx` lines 112–141 | `submitQuestion` chat flow — extend to handle `tool_call` field in the response |
| `scripts/chunk-transcripts.js` (Phase 2 of langchain_chat) | Pattern for iterating recipes and calling Gemini — Phase C semantic_search tool extends this |
| `netlify/functions/__tests__/recipe-chat.test.js` | `makeEvent` helper + `vi.stubGlobal('fetch')` mock pattern |

---

## Implementation Checklist

### PHASE A — IFrame Player API + Transport Tools

Phase A ships independently. No LangChain, no chunking dependency. A single Gemini call receives tool schemas and returns a tool call; the frontend executes it against the player.

#### 1. Frontend — `useYouTubePlayer` Hook

Create `src/hooks/useYouTubePlayer.js`.

**Hook signature:**
```javascript
export function useYouTubePlayer({ videoId, containerId })
```

**Returned object:**
```javascript
{
  ready,              // boolean — YT.Player fully initialized
  play,               // () => void
  pause,              // () => void
  seekTo,             // (seconds: number) => void
  rewind,             // (seconds?: number = 30) => void
  getCurrentTime,     // () => number
  error,              // string | null
}
```

- [ ] On mount, inject the IFrame API script if not already present:
  ```javascript
  if (!window.YT) {
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.body.appendChild(tag)
  }
  ```
- [ ] Register `window.onYouTubeIframeAPIReady` (or poll `window.YT?.Player`) and instantiate `new YT.Player(containerId, { videoId, events: { onReady } })` when the API is ready
- [ ] Hold the player instance in a `useRef`, flip `ready` to `true` from `onReady`
- [ ] `rewind(n = 30)` → `player.seekTo(Math.max(0, player.getCurrentTime() - n), true)`
- [ ] `seekTo(seconds)` → `player.seekTo(Math.max(0, seconds), true)`
- [ ] Cleanup on unmount: `player.destroy()`
- [ ] Test (manual): hook mounts, `ready` flips to true, calling `pause()` stops playback

#### 2. Frontend — RecipePage integration

Modify `src/pages/RecipePage.jsx`.

- [ ] Replace the `<iframe>` block (lines 333–347) with a `<div id="yt-player" className="w-full h-full" />` mount point inside the same aspect-video wrapper
- [ ] Import and initialize the hook:
  ```javascript
  const { ready, play, pause, rewind, seekTo } = useYouTubePlayer({
    videoId, containerId: 'yt-player',
  })
  ```
- [ ] Add a `toolDispatcher` callback that maps a tool-call response to the matching player action:
  ```javascript
  const dispatchToolCall = useCallback(({ name, args }) => {
    switch (name) {
      case 'play_video': return play()
      case 'pause_video': return pause()
      case 'rewind_seconds': return rewind(args?.seconds ?? 30)
      case 'seek_to_seconds': return seekTo(args?.seconds ?? 0)
      default: return
    }
  }, [play, pause, rewind, seekTo])
  ```
- [ ] Update `submitQuestion` (lines 112–141) so that when `data.toolCall` is present it:
  1. Calls `dispatchToolCall(data.toolCall)`
  2. Appends the confirmation `data.answer` to messages (the reply still flows through the existing chat bubble — just acknowledges the action)
- [ ] Test (manual, see §End-to-End Verification): "pause the video" stops playback and renders "Paused."

#### 3. Backend — `recipe-chat.js` tool schemas

Modify `netlify/functions/recipe-chat.js`.

- [ ] Add a `VIDEO_TOOLS` constant containing Gemini tool declarations for `play_video`, `pause_video`, `rewind_seconds`, `seek_to_seconds` (see `RE_video_control_agent_design.md` §Side-by-Side for the shape)
- [ ] Pass `tools: [{ functionDeclarations: VIDEO_TOOLS }]` in the `generateContent` body
- [ ] Update the system prompt so Gemini knows it can reply with a tool call for transport intent and a normal text answer otherwise — keep it terse: one or two sentences appended to the existing cooking-assistant prompt
- [ ] Parse Gemini response:
  - If `candidates[0].content.parts[0].functionCall` is present, extract `{ name, args }` → return `{ answer, toolCall: { name, args } }` where `answer` is the short confirmation string Gemini also returns (or a server-generated fallback like `"Paused."` if absent)
  - Otherwise, return the existing `{ answer }` shape unchanged
- [ ] Keep `thinkingConfig: { thinkingBudget: 1024 }` — tool selection benefits from the same reasoning budget as regular answers
- [ ] Test: POST `{ question: "pause", transcript }` → response contains `toolCall.name === 'pause_video'`
- [ ] Test: POST `{ question: "what temperature?", transcript }` → response has `answer` only, no `toolCall` (regression check)

#### 4. Backend — Unit tests

Modify `netlify/functions/__tests__/recipe-chat.test.js`.

- [ ] Mock Gemini response with a `functionCall` part → assert handler returns `toolCall: { name, args }`
- [ ] Mock Gemini response with only `text` part → assert handler returns `{ answer }` without `toolCall` (ensures regular Q&A path untouched)
- [ ] Mock Gemini response containing both `text` and `functionCall` → assert both `answer` and `toolCall` are returned
- [ ] Run `npm test` — new tests pass alongside existing cases

#### 5. Phase A — End-to-End Verification

- [ ] **Play / pause / resume:** Load a recipe → "pause the video" → playback stops, chat shows "Paused." → "play" → playback resumes
- [ ] **Natural phrasing:** "can you stop it for a sec" → pauses; "go back 30 seconds" → rewinds
- [ ] **Rewind clamp:** At `currentTime < 30` ask "rewind 30 seconds" → seeks to 0, not a negative value
- [ ] **Regression — plain Q&A:** "what temperature should I bake this at?" → normal answer, video playback untouched
- [ ] **Voice mode:** Toggle voice on → say "pause" → STT transcript flows through existing `submitQuestion` → pauses correctly and TTS reads "Paused." (verifies no regression with `useVoiceMode`)

### ✅ CHECK-IN AFTER PHASE A

Before starting Phase B, confirm with user:
- Phase A works reliably for the top 5 command phrasings (pause, play, resume, rewind, "go back")
- No regression in plain Q&A or voice mode
- Decision point: are we ready to extend to instruction-based seek, or does Phase A need iteration first?

---

### PHASE B — Instruction-Based Seek (Full Transcript)

Phase B reuses Phase A's tool-call plumbing. The only new capability is `seek_to_instruction`, which Gemini resolves by reading the full timestamped transcript already in the system prompt and returning a `seek_to_seconds` tool call. Depends on timestamped transcripts existing — that is what S1 introduces.

#### 6. Transcript re-enrichment with timestamps (S1)

- [ ] Modify `netlify/functions/playlist-enrich-processor.js` line 136:
  ```javascript
  // Before
  transcript = transcriptData.content.map(c => c.text).join(' ')
  // After
  transcript = transcriptData.content
    .map(c => `[${formatTime(c.offset)}] ${c.text}`)
    .join(' ')
  ```
- [ ] Add `formatTime(offsetMs)` helper — takes Supadata `offset` (ms), returns `MM:SS` (or `HH:MM:SS` if ≥ 1 hour)
- [ ] Create `scripts/reenrich-with-timestamps.js` — iterates all recipes with non-null `transcript`, unsets the `transcript` field, then invokes the enrich-processor for each. Supports `--dry-run` and `--recipe-id <uuid>` flags following the pattern from `scripts/chunk-transcripts.js`
- [ ] Dry-run the script → log which recipes would be re-enriched (expect all of them)
- [ ] Run against a single recipe (Buffalo Wings) → verify `recipes.transcript` now contains `[0:15] Hey everyone...` style markers
- [ ] Run against the full library → all transcripts now timestamped
- [ ] Verify: existing chunking logic (if/when run) still tolerates the bracket markers — `stripNoise` in `scripts/chunk-transcripts.js` already strips standalone timestamps and will need a small update to strip these inline ones too (coordinate with `IMPL_transcript_chunking.md` — add `[MM:SS]` / `[H:MM:SS]` patterns to the noise regex)

#### 7. Backend — `seek_to_instruction` tool (S2, S3, S4)

Modify `netlify/functions/recipe-chat.js`.

- [ ] Add `seek_to_instruction` to `VIDEO_TOOLS`:
  ```javascript
  {
    name: 'seek_to_instruction',
    description: 'Jumps the video to the moment matching a natural-language description (e.g. "where they make the sauce"). Returns a seek_to_seconds tool call internally — do NOT call directly; Gemini will resolve this by reading the timestamped transcript.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  }
  ```
  **Note:** This tool exists as a prompting signal. In practice Gemini will read the timestamped transcript and directly emit a `seek_to_seconds` tool call — the intermediate `seek_to_instruction` call is not required and the model is instructed to skip it. Keep the tool declared so the model knows instruction-seek is in scope.
- [ ] Extend the system prompt with instruction-seek guidance:
  ```
  When the user asks to jump to a specific moment ("skip to when they add the butter",
  "go to the sauce part"), find the matching [MM:SS] marker in the transcript and call
  seek_to_seconds with the timestamp converted to seconds. If no matching moment is
  clear from the transcript, reply in text that you couldn't find that step — do not
  guess a timestamp.
  ```
- [ ] Build confirmation reply expectation into the prompt: "When you call seek_to_seconds, include a short confirmation in your text reply (e.g. 'Jumped to 4:32 — that's where they start the sauce.')"
- [ ] Test: mock Gemini returning `seek_to_seconds(272)` + text "Jumped to 4:32..." → handler returns both
- [ ] Test: mock Gemini returning text only ("I couldn't find that step in this recipe.") → handler returns `{ answer }` with no `toolCall`

#### 8. Frontend — confirmation text

No code change required — Phase A already routes `data.toolCall` through `dispatchToolCall` and appends `data.answer` to messages. Verify:

- [ ] "skip to where they make the sauce" → video jumps, chat shows "Jumped to 4:32 — that's where they start the sauce."
- [ ] "go to when they season the chicken" → video jumps to the correct moment
- [ ] "jump to the dessert part" on a savoury recipe → chat shows "I couldn't find that step in this recipe." and video does NOT seek

#### 9. Phase B — End-to-End Verification

- [ ] **Instruction seek — present:** On Buffalo Wings, "skip to when they make the sauce" → seeks to the sauce step, confirmation rendered
- [ ] **Instruction seek — absent:** "skip to the tiramisu" on Buffalo Wings → decline message, no seek
- [ ] **Combined transport + seek:** Same session: "pause" → pauses; "go to the frying part" → seeks; "play" → resumes from new position
- [ ] **Voice mode:** Say "skip to the sauce" → STT + tool call flow works end-to-end with TTS reading the confirmation
- [ ] **Long video (25+ min):** Test on the longest transcript in the library — verify latency is acceptable (<3s) and seek accuracy holds
- [ ] **Regression — no transcript:** Recipe with `transcript=null` → "skip to the sauce" → falls through to existing "chat unavailable" path (no crash)

### ✅ CHECK-IN AFTER PHASE B

Before starting Phase C, confirm with user:
- Phase B latency on long videos is acceptable (target <3s end-to-end)
- Instruction-seek accuracy is good enough that users trust it
- Decision point: does `PRD_langchain_chat.md` Phase 2 chunking exist yet? If not, **Phase C is blocked** — stop here and revisit when chunking ships

---

### PHASE C — LangGraph Agent + Semantic Search

Phase C replaces the full-transcript read in `seek_to_instruction` with a LangGraph ReAct agent that calls `semantic_search` over the pre-chunked transcript. Reduces token cost on long videos and unlocks the retry-with-rephrase loop described in `RE_video_control_agent_design.md`.

**Prerequisites (from `PRD_langchain_chat.md`):**
- Phase 2 (chunking) complete: `recipes.transcript_chunks` populated with `{ text, start_ms, end_ms }`
- Phase 4 (pgvector RAG) complete OR in flight: embeddings available for `semantic_search`
- `@langchain/langgraph` + `@langchain/core` dependencies installed

#### 10. Install dependencies

- [ ] `npm install @langchain/langgraph @langchain/core @langchain/google-genai`
- [ ] Verify imports resolve in a throwaway test file before committing
- [ ] Commit the lockfile change separately from agent code for easier review

#### 11. Backend — `semantic_search` tool

- [ ] Implement `semanticSearch({ recipeId, query, topK = 3 })` in `netlify/functions/lib/semantic-search.js`:
  1. Embed `query` using the same embedding model used to embed chunks (per Phase 4 decision in `PRD_langchain_chat.md`)
  2. Query Supabase pgvector: `select text, start_ms, end_ms, 1 - (embedding <=> $query_embedding) as score from recipes_chunks where recipe_id = $1 order by score desc limit $topK`
  3. Return `[{ text, start_ms, end_ms, score }]`
- [ ] Unit test: given a fake Supabase client returning known rows, verify the handler returns them sorted by score
- [ ] Smoke test against a real recipe with chunks — verify top result for "make the sauce" has `score > 0.7`

#### 12. Backend — LangGraph ReAct agent

- [ ] Create the agent graph following the pseudocode in `RE_video_control_agent_design.md` §Side-by-Side:
  ```
  reason → search → evaluate
    ├─ score ≥ 0.7 → seek → respond
    └─ score < 0.7 → respond (decline)
  ```
- [ ] Nodes:
  - `reason` — Gemini decides what to search (may rephrase user's query)
  - `search` — calls `semanticSearch(recipeId, query)` tool
  - `evaluate` — picks best chunk, exposes `{ bestScore, bestChunk }` on state
  - `seek` — returns a `seek_to_seconds(bestChunk.start_ms / 1000)` tool call to the frontend
  - `respond` — final user-facing text (confirmation or decline)
- [ ] Conditional edge after `evaluate`: route to `seek` if `bestScore >= 0.7`, else to `respond`
- [ ] Retry logic: if first `search` returns `bestScore < 0.5`, loop back to `reason` with a rephrased query (cap at 1 retry to avoid runaway loops)
- [ ] Unit test: mock `semanticSearch` to return a high-score row → agent returns `seek_to_seconds` tool call
- [ ] Unit test: mock `semanticSearch` to return all low scores → agent returns decline text, no tool call
- [ ] Unit test: retry loop — first call returns low score, second rephrased call returns high score → agent seeks

#### 13. Backend — `recipe-chat.js` branching (C3)

Modify `netlify/functions/recipe-chat.js`.

- [ ] Fetch `transcript_chunks` alongside `transcript` when loading the recipe context (need a `recipeId` in the request body — add it and update the frontend call)
- [ ] Branch:
  - If `transcript_chunks` is non-empty AND user intent is instruction-seek (let Gemini classify via a cheap pre-screen — single tool-call round like Phase A) → invoke the LangGraph agent
  - Otherwise → fall through to Phase B path (full timestamped transcript + single Gemini call)
- [ ] Ensure transport-only commands (play / pause / rewind) stay on the Phase A fast path — do NOT route them through the agent; the overhead is unjustified for a 1-action response
- [ ] Test: recipe with chunks + "skip to the sauce" → LangGraph path taken, tool call returned
- [ ] Test: recipe WITHOUT chunks + "skip to the sauce" → Phase B fallback taken
- [ ] Test: recipe with chunks + "pause" → Phase A path taken (no agent invocation)

#### 14. Frontend — no changes expected

The agent's output shape matches Phase A / B: `{ answer, toolCall: { name: 'seek_to_seconds', args: { seconds } } }`. `dispatchToolCall` already handles `seek_to_seconds`.

- [ ] Verify: Phase C responses render the same way in the chat bubble as Phase B
- [ ] Verify: frontend makes no assumptions about which backend path handled the request (no breakage if request hits Phase B fallback)

#### 15. Phase C — End-to-End Verification

- [ ] **Chunked recipe, confident match:** "skip to where they brown the butter" → agent returns `seek_to_seconds`, video jumps, confirmation rendered
- [ ] **Chunked recipe, ambiguous match:** "skip to the tricky part" → agent declines with "I couldn't find that step — could you describe it differently?" (verifies the reason → rephrase retry path)
- [ ] **Chunked recipe, absent match:** "skip to the dessert" on a savoury recipe → decline, no seek
- [ ] **Unchunked recipe:** Phase B fallback still works end-to-end
- [ ] **Token cost comparison:** Log token usage for the same query against the same recipe, Phase B vs Phase C → verify Phase C is materially lower (the whole point of the migration)
- [ ] **Latency:** Phase C should be within ~500ms of Phase B for a short recipe (agent overhead) and meaningfully faster on long recipes (no full-transcript read)

### ✅ CHECK-IN AFTER PHASE C

Before closing out the PRD:
- Phase B fallback path is tested and reliable (critical — not every recipe will be chunked immediately)
- Phase C latency and cost are better than Phase B on the long-recipe benchmark
- Decision point: do we need `video-seek-agent.js` as a dedicated Netlify function, or does inlining in `recipe-chat.js` remain clean? (See Open Questions in PRD)

---

## Open Questions (tracked from PRD §6)

- Player-state-aware replies ("You're at 2:10, rewinding to 1:40.") — adds `getCurrentTime()` result to the system prompt. Deferred; revisit after Phase A ships.
- Minimum confidence threshold for Phase C seek — PRD placeholder is `0.7`. Tune against real recipes in §Phase C verification.
- Configurable rewind amount ("go back a little" vs "a minute") — Phase A's `rewind_seconds(n)` already accepts `n`; verify Gemini picks a sensible default when phrasing is vague.
- Split Phase C into its own Netlify function — revisit if `recipe-chat.js` grows past ~400 lines or cold-start becomes a problem.
