# Recipe Detail Page - PRD

## Overview
A dedicated page where users view a full recipe — video, ingredients, and cooking steps — alongside a chat assistant that can answer questions about the recipe grounded in the video transcript.

---

## 1. User Stories

### As a Home Cook

#### Viewing the Recipe
- I want a "View Recipe" button on each recipe card so I can navigate to the full recipe detail page
- I want to watch the recipe video on the page so I don't have to open YouTube separately
- I want to see the full ingredient list with quantities so I know what to buy
- I want to see step-by-step cooking instructions extracted from the transcript
- I want to add the recipe to my grocery list directly from this page

#### Using the Chat Assistant
- I want to ask questions about the recipe (e.g. "what temp should the oven be?") and get answers grounded in the video
- I want the chat to remember what I've already asked in the session so I can have a natural conversation
- I want answers to stream in so I'm not waiting for the full response
- I want to ask about ingredient substitutions (e.g. "can I use butter instead of ghee?")
- I want to ask about timing and technique (e.g. "how long should I sauté the onions?")

---

## 2. Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| F1 | Display embedded YouTube video player | Todo |
| F2 | Display full ingredient list (ingredients already stored with quantities) | Todo |
| F3 | Display cooking steps extracted from transcript | Todo — requires enrich pipeline update |
| F4 | Add to Grocery List button | Todo |
| F5 | Chat input + message history panel | Todo |
| F6 | Send question to Gemini with full transcript as context | Todo |
| F7 | Stream AI response back to the UI | Todo |
| F8 | Conversation memory — prior turns included in each request | Todo |
| F9 | Loading/thinking indicator while response streams | Todo |
| F10 | Empty/error state if transcript is unavailable for chat | Todo |

---

## 3. Page Layout

### Desktop

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Recipes          [Add to Grocery List]           │
├───────────────────────────────┬─────────────────────────────┤
│                               │                             │
│   YouTube Embedded Player     │   Chat Assistant            │
│                               │   ┌─────────────────────┐  │
│                               │   │ Chat history        │  │
│                               │   │                     │  │
│                               │   │                     │  │
├───────────────────────────────┤   │                     │  │
│   Ingredients                 │   │                     │  │
│   • 2 tbsp olive oil          │   └─────────────────────┘  │
│   • 3 cloves garlic           │   ┌─────────────────────┐  │
│   • ...                       │   │ Ask about this      │  │
│                               │   │ recipe...      [→]  │  │
│   Steps                       │   └─────────────────────┘  │
│   1. Preheat oven to 375°F    │                             │
│   2. ...                      │                             │
└───────────────────────────────┴─────────────────────────────┘
```

### Mobile

Single-column, tab-switched layout. Video stays pinned at the top; tabs toggle between Recipe content and Chat below it.

```
┌─────────────────────────┐
│  ←    Recipe Title      │
├─────────────────────────┤
│                         │
│  YouTube Embedded Player│
│                         │
├────────────┬────────────┤
│  Recipe    │    Chat    │  ← tab bar
├────────────┴────────────┤
│                         │
│  [Recipe tab active]    │
│                         │
│  Ingredients            │
│  • 2 tbsp olive oil     │
│  • 3 cloves garlic      │
│  • ...                  │
│                         │
│  Steps                  │
│  1. Preheat oven 375°F  │
│  2. ...                 │
│                         │
│  [Add to Grocery List]  │
│                         │
├─────────────────────────┤
│  [Chat tab active]      │
│                         │
│  ┌─────────────────────┐│
│  │ Chat history        ││
│  │                     ││
│  │                     ││
│  │                     ││
│  └─────────────────────┘│
│  ┌─────────────────────┐│
│  │ Ask about this      ││
│  │ recipe...      [→]  ││
│  └─────────────────────┘│
└─────────────────────────┘
```

**Mobile-specific behaviour:**
- Video player is 16:9, full device width
- Tab bar sticks below the video while scrolling the content area
- Chat input is pinned to the bottom of the screen when Chat tab is active so the keyboard doesn't obscure it
- Add to Grocery List button lives at the bottom of the Recipe tab (not in the header, to save space)

---

## 4. Chat System Design

### Context sent to Gemini per message
```
System: You are a cooking assistant. Answer questions only about the recipe below.
        Be concise and practical.

Transcript: <full transcript text>

Conversation:
User: <prior message 1>
Assistant: <prior response 1>
...
User: <current question>
```

### Conversation memory
- Stored in React component state (session only — not persisted to DB at this stage)
- Each new message appends to the history array passed in the next request
- History is cleared on page navigation

### Streaming
- Gemini streaming API via a Netlify function (`/netlify/functions/recipe-chat`)
- Frontend consumes the stream and appends tokens to the current assistant message as they arrive

---

## 5. Data Requirements

The following recipe fields must be populated for the full page to render:

| Field | Source | Status | Notes |
|-------|--------|--------|-------|
| `title` | YouTube API | Ready | |
| `youtube_video_id` | YouTube API | Ready | Used for embed URL |
| `video_url` | YouTube API | Ready | Fallback for video ID extraction |
| `channel` | YouTube API | Ready | |
| `ingredients` | Gemini extraction | Ready | Stored as `text[]` with quantities (e.g. "1 cup flour") |
| `transcript` | Supadata microservice | Ready | Full text stored after first enrich run |
| `steps` | Gemini extraction | **Not yet extracted** | New field — requires enrich pipeline update |

---

## 6. Out of Scope (for now)

- Voice input for the chat
- Saving/exporting chat history
- Cross-recipe questions ("which of my recipes uses the least oil?")
- Ingredient quantity normalization
- Sharing the recipe page with another user

---

## 7. Open Questions

- Should cooking steps be extracted during the existing enrich pipeline, or on-demand when the recipe detail page loads?
- Should chat history persist to Supabase for users who want to re-read a prior session?
- How do we handle long transcripts that exceed Gemini's context window? (Time-based chunking — see `research_arch_2026_02_24_video_qa_system.md`)
- Should the chat panel be visible on mobile, or collapsed behind a toggle? (Current design: collapsed behind Chat tab)
