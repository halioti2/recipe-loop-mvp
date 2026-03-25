## User Journeys

### J1: Sign In & Connect YouTube
User signs into the app, then separately authenticates with Google to grant YouTube playlist access.

**Step 1 — App sign in**

**Trigger:** Click [Sign in with Google]
**Requires:** No prior session

**On submit:**
- Supabase Google OAuth prompt opens — user selects account and approves
- Supabase session created; user lands on the home feed
- All app data scoped to this user via Row Level Security

**Step 2 — YouTube connection**

**Trigger:** Click [Connect YouTube] (from Playlist Discovery / Settings)
**Requires:** Active Supabase session

**On submit:**
- A separate Google OAuth flow opens requesting YouTube-specific scopes
- On approval, access token and refresh token stored in `user_oauth_tokens` table (server-side, not localStorage)
- UI updates to show "YouTube Connected" status
- All subsequent YouTube API calls fetch tokens from the database; tokens refresh on-demand when expired

---

### J2: Connect a Playlist & Sync Recipes
User connects a YouTube playlist and populates their recipe library.

**Trigger:** Navigate to Playlist Discovery (Settings), click [Connect] on a playlist
**Requires:** Signed in

**Auto-populated:**
- User's YouTube playlists fetched and listed automatically on page load

**On connect:**
- Playlist saved to `user_playlists` as active
- Background poller picks it up within 30 minutes; or user clicks [Resync & Enrich] on the home feed to trigger immediately

**On sync:**
- Fetches all videos from connected playlist via YouTube API
- Upserts each video as a recipe record in `recipes`; per-user membership written to `user_recipes`
- Skips videos already in the database (global deduplication)

**On enrich:**
- For each recipe missing ingredients: transcript fetched from transcript microservice, sent to Gemini
- Gemini returns structured ingredient list, stored as JSONB on the recipe record
- Recipe cards on the home feed update to show ingredient lists

---

### J3: Browse Recipes & Build a Grocery List
User picks recipes they want to cook and builds a combined shopping list.

**Trigger:** Navigate to Home feed (`/`)
**Requires:** At least one connected, synced, and enriched playlist

**Recipe library view:**
- Each recipe card shows: thumbnail, video title, channel name, AI-extracted ingredient list
- User clicks a card to open the full Recipe Detail page (`/recipe/:id`)

**Adding to grocery list:**
- User clicks [Add to Grocery List] on one or more recipe cards
- Action logged to `events` table; recipe linked to user's list in `lists`

**Trigger:** Navigate to Grocery List (`/list`)

**Grocery list view:**
- Shows all ingredients combined across every added recipe
- User can check off ingredients as they shop
