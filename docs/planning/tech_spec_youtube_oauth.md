# Technical Specification: YouTube OAuth Token Persistence

**Status:** Draft  
**Created:** February 21, 2026  
**Related:** [PRD](./PRD_youtube_oauth_persistence.md) | [RFC](./RFC_youtube_oauth_tokens.md)

---

## 1. Overview

Replace ephemeral localStorage OAuth tokens with database-backed persistence to enable reliable YouTube playlist sync across sessions.

**Goals:** Store tokens in DB, auto-refresh on expiry, clear UI status feedback  
**Non-Goals:** Multi-provider OAuth, token encryption, background refresh jobs, email notifications

---

## 2. Architecture

### Data Flow: First-Time Connection

```
┌─────────┐  1. Click "Connect"   ┌──────────────┐
│ Browser │ ─────────────────────▶│ Netlify Fn:  │
│         │                        │ /youtube/init│
└─────────┘                        └──────┬───────┘
                                          │ 2. Generate OAuth URL
                                          │    + state parameter
     ┌────────────────────────────────────┘
     │ 3. Redirect
     ▼
┌─────────────┐
│   Google    │  4. User grants permissions
│ OAuth Screen│
└──────┬──────┘
       │ 5. Redirect with code
       ▼
┌──────────────┐  6. Exchange code    ┌──────────┐
│ Netlify Fn:  │────────────────────▶ │  Google  │
│ /callback    │◀──────────────────── │ OAuth API│
└──────┬───────┘  7. Get tokens       └──────────┘
       │          (access + refresh)
       │ 8. Store in DB
       ▼
┌──────────────┐
│  Supabase DB │
│ oauth_tokens │
└──────┬───────┘
       │ 9. Redirect to /playlist-discovery?connected=true
       ▼
┌─────────┐
│ Browser │  "Connected ✓"
└─────────┘
```

### Data Flow: Playlist Sync with Auto-Refresh

```
┌─────────┐  1. Click "Sync"      ┌──────────────┐
│ Browser │ ─────────────────────▶│ Netlify Fn:  │
│         │                        │ /playlist-   │
└─────────┘                        │ sync         │
                                   └──────┬───────┘
                                          │ 2. Check token expiry
                                          ▼
                                   ┌──────────────┐
                                   │  Supabase DB │
                                   │ oauth_tokens │
                                   └──────┬───────┘
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    │                                             │
         Token Valid│                              Token Expired │
                    ▼                                             ▼
          ┌─────────────────┐                         ┌──────────────┐
          │ Use access_token│                         │ Refresh with │
          └────────┬────────┘                         │ refresh_token│
                   │                                  └──────┬───────┘
                   │                                         │ Update DB
                   │                                         │
                   └────────────────┬────────────────────────┘
                                    │ 3. Call YouTube API
                                    ▼
                             ┌──────────────┐
                             │  YouTube API │
                             └──────┬───────┘
                                    │ 4. Return playlist data
                                    ▼
                             ┌─────────┐
                             │ Browser │  Display recipes
                             └─────────┘
```

---

## 3. Database Schema

### Table: `user_oauth_tokens`

```sql
CREATE TABLE public.user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                    -- 'youtube', 'instagram', etc.
  access_token TEXT NOT NULL,                -- Short-lived (1 hour)
  refresh_token TEXT,                        -- Long-lived (no expiry)
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,           -- When access_token expires
  scopes TEXT[],                             -- Granted permissions (array)
  provider_user_id TEXT,                     -- e.g. YouTube channel ID
  provider_username TEXT,
  provider_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,                  -- Updated when token is used for API call
  last_refreshed_at TIMESTAMPTZ,             -- Updated when access token is refreshed
  CONSTRAINT user_provider_unique UNIQUE(user_id, provider)
);

CREATE INDEX idx_user_oauth_tokens_user_provider
ON public.user_oauth_tokens(user_id, provider);
```

### Row Level Security (RLS)

```sql
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only access their own tokens
CREATE POLICY "Users can read own oauth tokens"
ON public.user_oauth_tokens FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own oauth tokens"
ON public.user_oauth_tokens FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own oauth tokens"
ON public.user_oauth_tokens FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth tokens"
ON public.user_oauth_tokens FOR DELETE
USING (auth.uid() = user_id);
```

### Auto-Update Timestamp Trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_oauth_tokens_updated_at
BEFORE UPDATE ON public.user_oauth_tokens
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 4. API Contracts

### 4.1 `GET /auth/youtube/init`

**Purpose:** Generate Google OAuth URL with CSRF protection

**Auth:** Required (Supabase JWT in `Authorization` header)

**Response:**
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "base64_encoded_state"
}
```

**Implementation:**
1. Validate user JWT
2. Generate secure state: `{ userId, timestamp, random }`
3. Build OAuth URL with params:
   - `scope: 'https://www.googleapis.com/auth/youtube.readonly'`
   - `access_type: 'offline'` (forces refresh token)
   - `prompt: 'consent'` (ensures refresh token)
4. Return OAuth URL

**Errors:**
- `401` - Invalid/missing JWT

---

### 4.2 `GET /auth/youtube/callback`

**Purpose:** Exchange authorization code for tokens, store in DB

**Query Params:**
- `code` - Authorization code from Google
- `state` - CSRF protection token
- `error` - (optional) OAuth error from Google

**Response:** `HTTP 302` redirect to `/playlist-discovery?connected=true` or `?error=<code>`

**Implementation:**
1. Handle OAuth errors (user denied, etc.)
2. Validate state parameter:
   - Decode base64 JSON
   - Check timestamp < 10 minutes old
   - Extract `userId`
3. Exchange code for tokens via Google OAuth API
4. Calculate `expires_at` from `expires_in`
5. Upsert to `user_oauth_tokens` table
6. Redirect to success/error page

**Error Redirects:**
- `?error=access_denied` - User denied permissions
- `?error=invalid_state` - State validation failed
- `?error=token_exchange_failed` - Google API error

---

### 4.3 `GET /auth/youtube/status`

**Purpose:** Check if user has valid YouTube token

**Auth:** Required (Supabase JWT)

**Response (Connected):**
```json
{
  "connected": true,
  "expiresAt": "2026-04-22T10:30:00Z",
  "expiresIn": 5184000,
  "scope": "https://www.googleapis.com/auth/youtube.readonly"
}
```

**Response (Not Connected):**
```json
{
  "connected": false,
  "error": "no_token"  // or "token_expired"
}
```

**Implementation:**
1. Validate user JWT
2. Query `user_oauth_tokens` for user's YouTube token
3. If not found: Return `connected: false`
4. If found but expired: Return `connected: false, error: 'token_expired'`
5. If valid: Return connection details with `expiresIn` (seconds)

---

### 4.4 Token Refresh Utility (Internal)

**Function:** `refreshYouTubeToken(userId) → Promise<TokenData>`

**Purpose:** Refresh expired access token using refresh token

**Algorithm:**
1. Fetch current token from DB
2. Verify `refresh_token` exists
3. POST to Google OAuth API:
   ```
   grant_type: 'refresh_token'
   refresh_token: <from_db>
   client_id: <env>
   client_secret: <env>
   ```
4. Receive new `access_token` and `expires_in`
5. Update DB with new `access_token` and calculated `expires_at`
6. Return updated token

**Errors:**
- Throw if no token found
- Throw if no refresh_token
- Throw if Google rejects refresh
- Throw if DB update fails

**Used By:** `/playlist-sync` before YouTube API calls

---

### 4.5 `POST /playlist-sync` (Modified)

**New Logic:** Validate and refresh token before YouTube API call

**Pseudocode:**
```javascript
async function handler(event) {
  // 1. Authenticate user
  const user = await validateJWT(event.headers.authorization);
  
  // 2. Get valid YouTube token (auto-refresh if needed)
  const token = await getValidYouTubeToken(user.id);
  // ↑ This function:
  //   - Fetches token from DB
  //   - Checks if expires_at < now + 5 minutes
  //   - Calls refreshYouTubeToken() if expiring soon
  //   - Returns valid access_token
  
  // 3. Call YouTube API with token
  const playlistData = await fetchYouTubePlaylist(token, playlistId);
  
  // 4. Process and store recipes
  // ... existing logic ...
}
```

**Error Responses:**
```json
{
  "error": "youtube_not_connected",
  "message": "Please connect your YouTube account"
}
```
```json
{
  "error": "refresh_token_missing",
  "message": "YouTube connection expired. Please reconnect."
}
```

---

## 5. Frontend Implementation

### React Hook: `useYouTubeAuth()`

**Location:** `src/hooks/useYouTubeAuth.js`

**Returns:**
```typescript
{
  connected: boolean,
  loading: boolean,
  error: string | null,
  expiresAt: string | null,
  expiresIn: number | null,
  checkConnection: () => Promise<void>,
  connectYouTube: () => Promise<void>,
  disconnectYouTube: () => Promise<void>
}
```

**Behavior:**
- Auto-checks connection on mount
- `connectYouTube()` → Calls `/auth/youtube/init` → Redirects to Google
- `checkConnection()` → Calls `/auth/youtube/status` → Updates state
- `disconnectYouTube()` → Deletes token from DB via Supabase client

### Component: `<YouTubeConnectionStatus />`

**Location:** `src/components/YouTubeConnectionStatus.jsx`

**Visual States:**
- 🟢 **Connected:** Green background, shows expiry countdown
- 🟡 **Expired:** Yellow background, "Reconnect" button
- ⚪ **Not Connected:** Gray background, "Connect YouTube" button
- 🔄 **Loading:** Spinner with "Checking connection..."

### Page: `PlaylistDiscovery.jsx` (Modified)

**Changes:**
1. Import and render `<YouTubeConnectionStatus />` at top of page
2. Handle OAuth callback:
   - Check for `?connected=true` → Show success message for 5s
   - Check for `?error=<code>` → Show error notification
3. Update `handleSyncPlaylist()`:
   - Call `checkConnection()` before sync
   - If not connected, show alert and return
   - If sync fails with token error, call `checkConnection()` to update UI

---

## 6. Supabase Configuration

### Step 1: Run Database Migration

1. Open Supabase Dashboard → **SQL Editor**
2. Create new query
3. Paste migration SQL from Section 3
4. Click **Run**
5. Verify table exists in **Table Editor**

### Step 2: Verify RLS Policies

1. Go to **Authentication** → **Policies**
2. Select `user_oauth_tokens` table
3. Confirm 4 policies exist (SELECT, INSERT, UPDATE, DELETE)

### Step 3: Configure Environment Variables

Add to `.env` and Netlify:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # Backend only!

# Google OAuth
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret

# App URL
URL=https://your-app.netlify.app  # Update redirect URIs in Google Console
```

### Step 4: Update Google OAuth Redirect URIs

1. [Google Cloud Console](https://console.cloud.google.com) → **Credentials**
2. Select OAuth 2.0 Client ID
3. Add redirect URIs:
   ```
   https://your-app.netlify.app/.netlify/functions/auth-youtube-callback
   http://localhost:8888/.netlify/functions/auth-youtube-callback
   ```
4. Save and wait 5 minutes for propagation

---

## 7. Testing & Deployment

### Manual Testing Checklist

**Pre-Deployment:**
- [ ] First-time connection flow end-to-end
- [ ] Returning user (close browser, reopen, verify still connected)
- [ ] Token expiry simulation (set `expires_at` to past, verify "Expired" status)
- [ ] Token auto-refresh during sync (set expiry to 2 min, wait 3 min, sync)
- [ ] OAuth cancellation (click Connect, cancel Google screen)
- [ ] Cross-browser (Chrome, Safari, Firefox)

### Deployment Steps

1. **Deploy database migration** to production Supabase
2. **Add environment variables** to Netlify
3. **Update Google OAuth redirect URIs** for production
4. **Deploy code** via git push
5. **Smoke test** on production with test account

### Rollback Plan

If OAuth fails:
1. `git revert <commit>` and push
2. Keep database table (safe to leave, no breaking changes)
3. Notify users of temporary issues

---

## 8. Security & Monitoring

### Security Checklist

- ✅ Tokens stored server-side (not localStorage)
- ✅ RLS prevents cross-user access
- ✅ State parameter prevents CSRF
- ✅ HTTPS required for OAuth redirects
- ✅ Service role key never exposed to frontend
- ✅ Read-only YouTube scope (minimum permissions)

### Monitoring Queries

**Count recent OAuth connections:**
```sql
SELECT COUNT(*) FROM user_oauth_tokens 
WHERE created_at > NOW() - INTERVAL '7 days';
```

**Find expired tokens:**
```sql
SELECT user_id, expires_at FROM user_oauth_tokens 
WHERE expires_at < NOW();
```

**Token refresh activity:**
```sql
SELECT COUNT(*) FROM user_oauth_tokens 
WHERE updated_at > created_at + INTERVAL '1 hour'
AND updated_at > NOW() - INTERVAL '24 hours';
```

---

## 9. References

- [PRD: YouTube OAuth Persistence](./PRD_youtube_oauth_persistence.md)
- [RFC: YouTube OAuth Tokens](./RFC_youtube_oauth_tokens.md)
- [Google OAuth 2.0 Docs](https://developers.google.com/identity/protocols/oauth2)
- [Supabase RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)
