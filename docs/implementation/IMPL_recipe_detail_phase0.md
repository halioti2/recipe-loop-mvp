# Recipe Detail Page — Phase 0 Implementation

**PRD:** `docs/planning/PRD_recipe_detail.md`
**Scope:** Initial build using existing data only. No pipeline changes required.

---

## Functional Requirements Covered

| # | Requirement | Status |
|---|-------------|--------|
| F1 | Display embedded YouTube video player | Todo |
| F2 | Display full ingredient list (ingredients already stored with quantities) | Todo |
| F4 | Add to Grocery List button | Todo |
| F5 | Chat input + message history panel | Todo |
| F6 | Send question to Gemini with full transcript as context | Todo |
| F7 | Stream AI response back to the UI | Todo |
| F8 | Conversation memory — prior turns included in each request | Todo |
| F9 | Loading/thinking indicator while response streams | Todo |
| F10 | Empty/error state if transcript is unavailable for chat | Todo |

## Out of Scope for Phase 0

| # | Requirement | Reason |
|---|-------------|--------|
| F3 | Cooking steps | Not yet extracted — requires enrich pipeline update |

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `src/pages/RecipePage.jsx` | Build out from stub |
| `netlify/functions/recipe-chat.js` | New — Gemini chat function |
| `src/pages/HomePage.jsx` | Add "View Recipe" button to each card linking to `/recipe/:id` |

---

## Implementation Checklist

### Stub
- [ ] Replace `RecipePage.jsx` stub with a page that fetches the recipe by ID from Supabase and renders the title
- [ ] Test: navigate to `/recipe/:id` and confirm the correct recipe title loads
- [ ] Add "View Recipe" button to recipe cards on `HomePage.jsx` linking to `/recipe/:id`
- [ ] Test: clicking "View Recipe" on a card navigates to the correct recipe detail page

### Recipe Content
- [ ] Render embedded YouTube video player using `youtube_video_id`
- [ ] Test: video loads and plays
- [ ] Render ingredient list below the video
- [ ] Test: ingredients display correctly with quantities
- [ ] Add "Add to Grocery List" button (reuse logic from `HomePage.jsx`)
- [ ] Test: adding to grocery list from recipe detail page appears on `/list`
- [ ] Implement mobile tab layout (Recipe / Chat tabs below video)
- [ ] Test: tab switching works on a mobile viewport

### Gemini Chat — Netlify Function
- [ ] Create `netlify/functions/recipe-chat.js` that accepts `{ question, transcript, history }` and calls Gemini
- [ ] Test: POST to function with a sample transcript and question returns a valid response
- [ ] Add streaming support to the function using Gemini streaming API
- [ ] Test: response streams token-by-token rather than returning all at once

### Gemini Chat — Frontend
- [ ] Wire chat input to call `recipe-chat` function with current question, transcript, and conversation history
- [ ] Test: asking a question returns a grounded answer about the recipe
- [ ] Render streaming response — append tokens to the current assistant message as they arrive
- [ ] Test: answer visibly streams in rather than appearing all at once
- [ ] Add loading/thinking indicator while waiting for first token
- [ ] Test: indicator appears on submit and disappears when streaming begins
- [ ] Maintain conversation history in state and pass prior turns with each new request
- [ ] Test: a follow-up question ("what about the sauce?") references context from the previous answer
- [ ] Show empty/error state if `transcript` is null or empty
- [ ] Test: recipe with no transcript shows a "chat unavailable" message instead of the input
