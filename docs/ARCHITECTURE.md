# Recipe Loop MVP — Architecture Overview

A high-level map of how the system fits together. Not a deep technical spec — just enough to understand impact of changes and talk to the codebase.

---

## System diagram

```
┌─────────────────────────────────────────────────┐
│                  Browser (React)                │
│  Vite + React Router + Tailwind CSS             │
│                                                 │
│  Pages / Components        Contexts / Services  │
│  ─────────────────         ──────────────────── │
│  HomePage                  AuthContext          │
│  PlaylistDiscoveryPage     YouTubeService       │
│  RecipePage                supabaseClient       │
│  GroceryListPage                                │
│  LoginPage / ProfilePage                        │
└────────────┬──────────────────────┬─────────────┘
             │  Fetch (REST)        │  Supabase JS client
             ▼                      ▼
┌─────────────────────┐   ┌──────────────────────────┐
│  Netlify Functions  │   │  Supabase                │
│  (Node.js ESM)      │   │                          │
│                     │   │  Auth (Google OAuth)     │
│  playlist-sync      │   │  PostgreSQL DB           │
│  enrich             │   │  Row Level Security      │
│  transcript-fill    │   │                          │
│  refresh-google-    │   └────────────┬─────────────┘
│    token            │                │ Postgres
│  sync (legacy)      │   ┌────────────┴─────────────┐
└────────┬────────────┘   │  Database Tables         │
         │                │  ─────────────────────── │
         │  API calls     │  recipes                 │
         ▼                │  user_recipes            │
┌─────────────────────┐   │  user_playlists          │
│  External APIs      │   │  playlist_sync_logs      │
│                     │   │  lists                   │
│  YouTube Data API   │   │  events                  │
│  Google Gemini API  │   └──────────────────────────┘
│  Google OAuth       │
└─────────────────────┘
```

---

## Subsystems

### Frontend (React app)
- Built with Vite, served as a static site on Netlify.
- React Router for client-side routing; all routes are protected behind `ProtectedRoute` except `/login`.
- `AuthContext` is the single source of truth for the logged-in user and YouTube token. It stores the Google provider token in `localStorage` (1-hour TTL) to survive page refreshes.
- `YouTubeService` wraps YouTube Data API calls (playlist listing, video fetching) using the OAuth token from `AuthContext`.
- Supabase JS client (`supabaseClient.js`) handles all database reads/writes directly from the browser for low-latency user-facing queries.

**Key files:** [src/App.jsx](../src/App.jsx), [src/contexts/AuthContext.jsx](../src/contexts/AuthContext.jsx), [src/services/youtubeService.js](../src/services/youtubeService.js)

---

### Netlify Functions (serverless backend)
- Node.js ESM modules, deployed alongside the static site.
- Used for operations that need server-side secrets (Gemini API key, Supabase service role key) or that are too slow/heavy for the browser.
- Functions use the **Supabase service role key** (bypasses RLS) — they are trusted server-side operations.
- CORS headers are set on all functions to allow browser calls.

| Function | Trigger | Purpose |
|---|---|---|
| `playlist-sync` | POST from frontend | Fetch YouTube playlist videos → upsert into `recipes` + `user_recipes` |
| `enrich` | GET from frontend | Find un-enriched recipes → call Gemini → write `ingredients` |
| `transcript-fill` | GET from frontend | Find recipes without transcripts → fetch and store transcript text |
| `refresh-google-token` | POST from frontend | Use stored refresh token to get a new Google access token |
| `sync` | GET from frontend | Legacy: sync a single hardcoded playlist |
| `playlist-enrich` / `playlist-enrich-finder` / `playlist-enrich-processor` | Internal | Batch enrichment helpers |

**Key files:** [netlify/functions/](../netlify/functions/), [netlify.toml](../netlify.toml)

---

### Supabase (Auth + Database)
- **Auth:** Google OAuth only. Sign-in with `youtube.readonly` scope so the provider token can be used by the frontend `YouTubeService`. Supabase manages sessions; the Google provider token is extracted at sign-in and cached in `localStorage`.
- **Database:** PostgreSQL. All tables have RLS enabled; current policies are permissive (`FOR ALL USING (true)`) — user scoping is enforced in application-level queries (`WHERE user_id = ?`).
- **Service role key** is held only in Netlify environment variables and used exclusively in server-side functions.

---

## Data flow: sync a playlist

```
User clicks "Sync Recipes"
  → Frontend calls POST /.netlify/functions/playlist-sync
      with { user_playlist_id, youtube_token }
  → Function fetches playlist videos from YouTube Data API
  → For each video:
      - Upsert into `recipes` (keyed on youtube_video_id)
      - Upsert into `user_recipes` (keyed on user_id + recipe_id)
  → Returns counts: new recipes, added to user, already present
  → Frontend shows success banner
```

## Data flow: enrich a recipe

```
User clicks "Resync & Enrich" (or enrich runs automatically)
  → Frontend calls GET /.netlify/functions/transcript-fill
      - Finds recipes WHERE transcript IS NULL
      - Fetches transcript from YouTube
      - Writes to recipes.transcript
  → Frontend calls GET /.netlify/functions/enrich
      - Finds recipes WHERE ingredients IS NULL AND transcript IS NOT NULL
      - Sends transcript to Gemini API
      - Parses response into string array
      - Writes to recipes.ingredients (JSONB)
```

---

## Database schema summary

Full schema: [schema/database_schema.sql](../schema/database_schema.sql)

| Table | Key columns | Notes |
|---|---|---|
| `recipes` | `id`, `youtube_video_id`, `title`, `channel`, `transcript`, `ingredients` (JSONB), `user_id` | Global; one row per unique YouTube video |
| `user_recipes` | `user_id`, `recipe_id`, `playlist_id`, `is_favorite` | Junction — links users to recipes from specific playlists |
| `user_playlists` | `user_id`, `youtube_playlist_id`, `active`, `sync_enabled`, `last_synced` | One row per connected playlist per user |
| `playlist_sync_logs` | `playlist_id`, `status`, `recipes_added`, `errors` | Audit trail for each sync run |
| `lists` | `user_id`, `recipe_id`, `ingredients` (JSONB) | Grocery list entries |
| `events` | `user_id`, `action`, `recipe_id` | Analytics event log |

---

## Deployment

- **Hosting:** Netlify. Static build (`npm run build` → `dist/`) + Functions (`netlify/functions/`).
- **Config:** [netlify.toml](../netlify.toml) defines build command, publish dir, and functions directory.
- **Environment variables** (set in Netlify dashboard):
  - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — frontend Supabase client
  - `SUPABASE_SERVICE_ROLE_KEY` — backend functions (never exposed to browser)
  - `YOUTUBE_API_KEY` — YouTube Data API (used in legacy sync function)
  - `GEMINI_API_KEY` — Google Gemini for ingredient extraction
  - `VITE_GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_SECRET` — optional, for direct token refresh fallback

---

## Known architectural constraints

- **YouTube token lifetime:** Google OAuth tokens expire in ~1 hour. After a page refresh, Supabase does not re-expose the provider token. The current workaround caches the token in `localStorage` and attempts refresh via the `refresh-google-token` function. If all strategies fail, the user must re-authenticate.
- **RLS is not enforced at DB level:** Current policies allow all operations. User isolation depends on correct `WHERE user_id = auth.uid()` in application queries. Tightening RLS is a recommended pre-production step.
- **`recipes.user_id` is legacy:** The `user_recipes` junction table is the correct way to associate a user with a recipe. `recipes.user_id` is from before the multi-user architecture was added and should not be relied on.
