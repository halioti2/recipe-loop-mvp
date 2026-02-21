# Recipe Loop MVP — Project Overview

## What is this?

**Recipe Loop** is a web app that turns a user's YouTube recipe playlists into a personal recipe library with auto-extracted ingredients and grocery list generation.

A user signs in with Google, connects their YouTube playlists, and the app syncs each video into a recipe card. AI (Gemini) then reads the video transcript and extracts the ingredient list. From there, the user can add any recipe to their grocery list.

---

## Target users

Home cooks who watch recipe content on YouTube and want a frictionless way to go from "video I saved" to "grocery list I can shop from" — without manually copying ingredients.

---

## MVP goals / success criteria

1. A user can sign in with Google and have their YouTube playlists discovered automatically.
2. A connected playlist's videos are synced as recipe records in the database.
3. Gemini AI extracts ingredient lists from video transcripts with no manual input.
4. A user can add recipes to a grocery list and view the combined ingredient set.
5. Data is user-scoped: each user only sees their own recipes and lists.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + Tailwind CSS |
| Hosting / serverless | Netlify (static site + Netlify Functions) |
| Database + Auth | Supabase (PostgreSQL + Google OAuth) |
| YouTube data | YouTube Data API v3 |
| AI enrichment | Google Gemini API |

---

## Core features

### 1. Playlist discovery & connection
Users connect individual YouTube playlists they want tracked. Playlists can be connected, disconnected, or re-activated. Only connected playlists are scanned for new videos.

**Where:** [PlaylistDiscoveryPage.jsx](../src/pages/PlaylistDiscoveryPage.jsx), [youtubeService.js](../src/services/youtubeService.js)

### 2. Smart playlist sync (Phase 2.3)
When a user triggers a sync, the backend fetches all videos from the connected playlist via the YouTube API and upserts them as recipe records. Global deduplication ensures a video shared across users is stored once in `recipes`; per-user membership is tracked in `user_recipes`.

**Where:** [netlify/functions/playlist-sync.js](../netlify/functions/playlist-sync.js)

### 3. AI ingredient extraction (enrichment)
For each recipe that lacks ingredients, the enrichment function fetches the video transcript and sends it to Gemini to extract a structured ingredient list, stored as a JSONB array.

**Where:** [netlify/functions/enrich.js](../netlify/functions/enrich.js), [netlify/functions/transcript-fill.js](../netlify/functions/transcript-fill.js)

### 4. Recipe library (home feed)
Users see all their synced recipes as cards with thumbnails, channel name, and ingredient lists. A "Resync & Enrich" button lets users manually trigger a full sync + enrichment pass.

**Where:** [src/pages/HomePage.jsx](../src/pages/HomePage.jsx)

### 5. Grocery list
Users add recipes to their grocery list. The list page shows the combined ingredients across all added recipes.

**Where:** [src/components/GroceryListPage.jsx](../src/components/GroceryListPage.jsx), [src/pages/ListPage.jsx](../src/pages/ListPage.jsx)

### 6. Auth (Google OAuth via Supabase)
Sign-in is Google-only, which also grants the YouTube OAuth token needed for playlist access. The token is held in session and used by the frontend YouTube service and passed to sync functions.

**Where:** [src/contexts/AuthContext.jsx](../src/contexts/AuthContext.jsx), [src/components/LoginPage.jsx](../src/components/LoginPage.jsx)

---

## Routes

| Path | Feature | Component |
|---|---|---|
| `/` | Recipe library / home feed | [HomePage.jsx](../src/pages/HomePage.jsx) |
| `/recipe/:id` | Recipe detail | [RecipePage.jsx](../src/pages/RecipePage.jsx) |
| `/list` | Grocery list | [ListPage.jsx](../src/pages/ListPage.jsx) |
| `/login` | Auth | [LoginPage.jsx](../src/components/LoginPage.jsx) |
| `/profile` | User profile | [ProfilePage.jsx](../src/components/ProfilePage.jsx) |

---

## Serverless API endpoints

| Endpoint | Purpose |
|---|---|
| `/.netlify/functions/sync` | Legacy: sync a single fixed playlist |
| `/.netlify/functions/playlist-sync` | Phase 2.3: smart sync for a user-connected playlist |
| `/.netlify/functions/enrich` | AI ingredient extraction for un-enriched recipes |
| `/.netlify/functions/transcript-fill` | Populate raw transcripts for recipes |
| `/.netlify/functions/refresh-google-token` | Refresh expired Google OAuth token |

---

## Database areas

| Table | Purpose |
|---|---|
| `recipes` | Global recipe records (YouTube video metadata + AI ingredients) |
| `user_recipes` | Per-user membership: links a user to a recipe from a playlist |
| `user_playlists` | Playlists a user has connected (active/inactive flag) |
| `lists` | A user's grocery list entries, linking recipes and their ingredients |
| `events` | User action log (e.g. `add_to_grocery_list`) for analytics |

Row-level security (RLS) in Supabase ensures users can only read/write their own rows.

---

## Deployment

- Hosted on **Netlify**; config in [netlify.toml](../netlify.toml).
- Environment variables required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `YOUTUBE_API_KEY`, `GEMINI_API_KEY`.
- Database schema: [database_schema.sql](../database_schema.sql).
- See [README.md](../README.md) for local development setup.

---

## Related docs

- [README.md](../README.md) — how to run and build locally
- [docs/docs_overview.md](./docs_overview.md) — guide to PM documentation options for this repo
