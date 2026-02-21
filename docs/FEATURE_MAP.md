# Recipe Loop MVP — Feature Map

A scope-level reference: what's in the product, where it lives, and what's currently out of scope.

---

## User-facing features

### Auth
Sign in / sign out with Google. Google OAuth also grants the YouTube scope required for playlist access. No email/password login is supported in the current flow (though the code exists as a legacy path).

| What | Where |
|---|---|
| Login page & Google sign-in button | [src/components/LoginPage.jsx](../src/components/LoginPage.jsx) |
| Auth state, token storage, YouTube token retrieval | [src/contexts/AuthContext.jsx](../src/contexts/AuthContext.jsx) |
| Protected route wrapper | [src/components/ProtectedRoute.jsx](../src/components/ProtectedRoute.jsx) |
| Google token refresh (backend) | [netlify/functions/refresh-google-token.js](../netlify/functions/refresh-google-token.js) |

---

### YouTube playlist management
Users browse their own YouTube playlists, connect the ones they want tracked, and disconnect any they no longer want. Connected playlists are stored in `user_playlists` with an `active` flag so history is preserved on disconnect.

| What | Where |
|---|---|
| Playlist discovery UI | [src/pages/PlaylistDiscoveryPage.jsx](../src/pages/PlaylistDiscoveryPage.jsx) |
| YouTube API calls (list playlists, channel info) | [src/services/youtubeService.js](../src/services/youtubeService.js) |
| Connect / disconnect playlist (Supabase write) | Inside `PlaylistDiscoveryPage.jsx` |
| Navigation indicator for YouTube connection status | [src/components/Navigation.jsx](../src/components/Navigation.jsx) |

---

### Playlist sync
Syncing fetches every video from a connected playlist via the YouTube Data API and upserts them as recipe records. Global deduplication uses `youtube_video_id` so the same video shared by two users creates only one `recipes` row; per-user membership is tracked in `user_recipes`.

| What | Where |
|---|---|
| Sync trigger (frontend) | [src/pages/PlaylistDiscoveryPage.jsx](../src/pages/PlaylistDiscoveryPage.jsx) — `handleSyncPlaylist` |
| Smart sync handler (Phase 2.3) | [netlify/functions/playlist-sync.js](../netlify/functions/playlist-sync.js) |
| Legacy single-playlist sync | [netlify/functions/sync.js](../netlify/functions/sync.js) |
| Sync log table | `playlist_sync_logs` (see [schema](../schema/database_schema.sql)) |

---

### AI ingredient extraction (enrichment)
For recipes without an ingredient list, the enrichment function pulls the video transcript then calls Gemini to parse out ingredients as a structured array. Transcripts are fetched separately and stored in `recipes.transcript` before enrichment runs.

| What | Where |
|---|---|
| Enrichment function (Gemini call) | [netlify/functions/enrich.js](../netlify/functions/enrich.js) |
| Transcript fetch & storage | [netlify/functions/transcript-fill.js](../netlify/functions/transcript-fill.js) |
| Transcript fetch utility | [src/lib/fetchTranscript.js](../src/lib/fetchTranscript.js) |
| Manual trigger ("Resync & Enrich" button) | [src/pages/HomePage.jsx](../src/pages/HomePage.jsx) — `handleResync` |

---

### Recipe library (home feed)
The main screen shows a user's synced recipes as cards: thumbnail, title, channel, and a collapsible ingredient list. Users can trigger a full sync + enrich from here.

| What | Where |
|---|---|
| Recipe card grid | [src/pages/HomePage.jsx](../src/pages/HomePage.jsx) |
| Recipe detail page | [src/pages/RecipePage.jsx](../src/pages/RecipePage.jsx) |

---

### Grocery list
A user adds a recipe to their grocery list; its ingredients are written to the `lists` table. The list page shows all added recipes and their combined ingredients. Adding the same recipe twice is blocked.

| What | Where |
|---|---|
| "Add to Grocery List" action | [src/pages/HomePage.jsx](../src/pages/HomePage.jsx) — `handleAddToGroceryList` |
| Grocery list UI | [src/components/GroceryListPage.jsx](../src/components/GroceryListPage.jsx) |
| List page route | [src/pages/ListPage.jsx](../src/pages/ListPage.jsx) |

---

### User profile
Basic profile page showing account info.

| What | Where |
|---|---|
| Profile page | [src/components/ProfilePage.jsx](../src/components/ProfilePage.jsx) |

---

## Routes

| Path | Feature | Notes |
|---|---|---|
| `/login` | Auth | Google sign-in |
| `/` | Recipe library | Requires auth |
| `/recipe/:id` | Recipe detail | Requires auth |
| `/playlists` | Playlist management | Requires auth + YouTube access |
| `/grocery-list` | Grocery list | Requires auth |
| `/profile` | User profile | Requires auth |

---

## Out of scope (MVP)

- Manual recipe entry (no YouTube source)
- Recipe search / filtering within the library
- Shared or collaborative grocery lists
- Meal planning
- Push notifications for new playlist videos
- Mobile app

---

## In-progress / known gaps

- YouTube OAuth token persistence after page refresh is unreliable due to Supabase limitations; users may need to re-authenticate. Workaround tokens are stored in `localStorage` with a 1-hour TTL.
- RLS policies are currently permissive (`FOR ALL USING (true)`) — user-scoped enforcement is handled in application queries rather than at the DB layer.
- `GroceryListPage.jsx` reads from a `grocery_lists` table that may not match the current `lists` table schema — needs reconciliation.
