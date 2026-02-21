# Implementation Plan: YouTube OAuth Token Persistence

**Status:** Ready to Execute  
**Created:** February 21, 2026  
**Related:** [PRD](./PRD_youtube_oauth_persistence.md) | [Tech Spec](./tech_spec_youtube_oauth.md)

---

## Overview

This plan breaks down the YouTube OAuth token persistence feature into ordered, testable tasks.

**Estimated Time:** 8-12 hours  
**Risk Level:** Medium (external OAuth dependency)

---

## Phase 1: Database & Backend Foundation (3-4 hours)

### Task 1.1: Create Database Schema
**Time:** 30 min
**Files:** `schema/migrations/add_user_oauth_tokens.sql`

**Step 0 — Check for existing table (run first):**

If you have attempted this migration before, the table may already exist with an older, incomplete schema. Run this in the Supabase SQL Editor to check:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'user_oauth_tokens'
ORDER BY ordinal_position;
```

- If the table **does not exist** → proceed to Step 1.
- If the table **exists with the old schema** (missing `last_used_at`, `last_refreshed_at`, `provider_user_id`, etc.) and **has no real user data** → drop and recreate:
  ```sql
  DROP TABLE IF EXISTS public.user_oauth_tokens;
  ```
- If the table **exists with the old schema** and **has real data you want to keep** → use ALTER TABLE to add missing columns instead of recreating:
  ```sql
  ALTER TABLE public.user_oauth_tokens
    ADD COLUMN IF NOT EXISTS token_type TEXT DEFAULT 'Bearer',
    ADD COLUMN IF NOT EXISTS provider_user_id TEXT,
    ADD COLUMN IF NOT EXISTS provider_username TEXT,
    ADD COLUMN IF NOT EXISTS provider_email TEXT,
    ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;

  -- If scope was TEXT, rename and replace with TEXT[]
  ALTER TABLE public.user_oauth_tokens
    RENAME COLUMN scope TO scope_old;
  ALTER TABLE public.user_oauth_tokens
    ADD COLUMN scopes TEXT[];
  -- Migrate existing data: UPDATE ... SET scopes = ARRAY[scope_old] WHERE scope_old IS NOT NULL;
  ALTER TABLE public.user_oauth_tokens DROP COLUMN scope_old;
  ```

**Step 1 — Run migration SQL:**

Paste the following into the Supabase SQL Editor and run it all at once:

```sql
-- ============================================================
-- Table
-- ============================================================
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

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

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

-- ============================================================
-- Auto-update updated_at trigger
-- ============================================================
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

- [ ] Run migration in Supabase SQL Editor
- [ ] Verify table created in Table Editor
- [ ] Verify RLS enabled (lock icon visible)
- [ ] Verify 4 RLS policies created in Authentication → Policies

**Success Criteria:**
- Table exists with correct schema (including `last_used_at`, `last_refreshed_at`, `scopes TEXT[]`)
- 4 RLS policies active (SELECT, INSERT, UPDATE, DELETE)
- Lock icon shows RLS is enabled

**Note:** RLS testing will happen in **Task 3.1** after OAuth flow creates real data

---

### Task 1.2: Verify Environment Variables
**Time:** 5 min  
**Files:** `.env` (already configured ✓)

**Already have:**
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `GOOGLE_CLIENT_ID`
- ✅ `GOOGLE_CLIENT_SECRET`
- ✅ Supabase URL and anon key

**Need to add:**
- [ ] Add `URL` environment variable:
  ```bash
  # Add to .env
  URL=http://localhost:8888
  ```
- [ ] Verify same variables exist in Netlify dashboard (for production)

**Update Google OAuth redirect URIs (ADD to existing list):**
- [ ] Go to [Google Cloud Console](https://console.cloud.google.com)
- [ ] APIs & Services → Credentials → OAuth 2.0 Client
- [ ] **Keep existing:** `https://yxfjigepxqerdehmshdl.supabase.co/auth/v1/callback` (Supabase auth)
- [ ] **Add new:**
  - `http://localhost:8888/.netlify/functions/auth-youtube-callback` (dev)
  - `https://your-app.netlify.app/.netlify/functions/auth-youtube-callback` (production)
- [ ] Save and wait 5 minutes

**Why both?**
- Supabase redirect = App sign-in (existing)
- Custom redirect = YouTube connection (new feature)
- Same Google Client ID can handle multiple redirect URIs!

**Success Criteria:** `URL` added, both redirect URIs whitelisted in Google Console

---

### Task 1.3: Create Token Refresh Utility
**Time:** 45 min  
**Files:** `netlify/functions/utils/refreshYouTubeToken.js`

**Implementation:**
```javascript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function refreshYouTubeToken(userId) {
  // 1. Fetch current token from DB
  // 2. Verify refresh_token exists
  // 3. POST to Google OAuth token endpoint
  // 4. Update DB with new access_token and expires_at
  // 5. Return updated token
}
```

- [ ] Implement function following algorithm in tech spec Section 4.4
- [ ] Add error handling for each failure mode
- [ ] After successful refresh, update `last_refreshed_at = NOW()` in DB alongside the new `access_token` and `expires_at`
- [ ] Add console.log statements for debugging
- [ ] Export function

**Success Criteria:** Function compiles, exports correctly

**Test Later:** Will test with real OAuth flow in Phase 2

---

### Task 1.4: Create `/auth/youtube/init` Endpoint
**Time:** 45 min  
**Files:** `netlify/functions/auth-youtube-init.js`

**Implementation:**
```javascript
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export async function handler(event, context) {
  // 1. Validate JWT from Authorization header
  // 2. Generate secure state parameter
  // 3. Build Google OAuth URL
  // 4. Return JSON with url and state
}
```

- [ ] Implement following tech spec Section 4.1
- [ ] Use `crypto.randomBytes(32)` for state
- [ ] Encode state as base64 JSON: `{ userId, timestamp, random }`
- [ ] Include OAuth params: `scope`, `access_type: 'offline'`, `prompt: 'consent'`
- [ ] Return 401 if JWT invalid

**Success Criteria:** Function returns OAuth URL when tested with curl

**Manual Test:**
```bash
curl -H "Authorization: Bearer <your_jwt>" \
  http://localhost:8888/.netlify/functions/auth-youtube-init
```

---

### Task 1.5: Create `/auth/youtube/callback` Endpoint
**Time:** 60 min  
**Files:** `netlify/functions/auth-youtube-callback.js`

**Implementation:**
```javascript
import { createClient } from '@supabase/supabase-js';

export async function handler(event, context) {
  // 1. Check for error param (user denied)
  // 2. Validate state parameter
  // 3. Exchange code for tokens (POST to Google)
  // 4. Calculate expires_at
  // 5. Upsert to user_oauth_tokens
  // 6. Redirect to /playlist-discovery?connected=true
}
```

- [ ] Implement following tech spec Section 4.2
- [ ] Validate state timestamp < 10 minutes
- [ ] Exchange code via `https://oauth2.googleapis.com/token`
- [ ] Handle all error cases with appropriate redirects
- [ ] Use service role key for DB upsert

**Success Criteria:** Function handles callback, stores token, redirects

**Test Later:** Will test with real OAuth flow in Phase 2

---

### Task 1.6: Create `/auth/youtube/status` Endpoint
**Time:** 30 min  
**Files:** `netlify/functions/auth-youtube-status.js`

**Implementation:**
```javascript
export async function handler(event, context) {
  // 1. Validate JWT
  // 2. Query user_oauth_tokens for user's YouTube token
  // 3. Check if expired
  // 4. Return connection status with expiry info
}
```

- [ ] Implement following tech spec Section 4.3
- [ ] Return different responses for: connected, not connected, expired
- [ ] Calculate `expiresIn` in seconds

**Success Criteria:** Endpoint returns correct status

**Manual Test:**
```bash
curl -H "Authorization: Bearer <your_jwt>" \
  http://localhost:8888/.netlify/functions/auth-youtube-status
```

---

## Phase 2: Frontend Implementation (2-3 hours)

### Task 2.1: Create `useYouTubeAuth` Hook
**Time:** 45 min  
**Files:** `src/hooks/useYouTubeAuth.js`

**Implementation:**
```javascript
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export function useYouTubeAuth() {
  const { session } = useAuth();
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    loading: true,
    error: null,
    expiresAt: null,
    expiresIn: null
  });

  // Auto-check on mount
  useEffect(() => {
    if (session?.access_token) {
      checkConnection();
    }
  }, [session]);

  async function checkConnection() { /* ... */ }
  async function connectYouTube() { /* ... */ }
  async function disconnectYouTube() { /* ... */ }

  return { ...connectionStatus, checkConnection, connectYouTube, disconnectYouTube };
}
```

- [ ] Implement state management
- [ ] `checkConnection()` calls `/auth/youtube/status`
- [ ] `connectYouTube()` calls `/auth/youtube/init`, redirects to OAuth URL
- [ ] `disconnectYouTube()` deletes token from DB
- [ ] Handle loading and error states

**Success Criteria:** Hook exports all methods, compiles without errors

**Manual Test:** Import in a test component, log returned values

---

### Task 2.2: Create `YouTubeConnectionStatus` Component
**Time:** 45 min  
**Files:** `src/components/YouTubeConnectionStatus.jsx`

**Implementation:**
```jsx
import { useYouTubeAuth } from '../hooks/useYouTubeAuth';

export function YouTubeConnectionStatus() {
  const { connected, loading, error, expiresIn, connectYouTube } = useYouTubeAuth();

  if (loading) return <LoadingState />;
  if (connected) return <ConnectedState expiresIn={expiresIn} />;
  if (error === 'token_expired') return <ExpiredState onReconnect={connectYouTube} />;
  return <NotConnectedState onConnect={connectYouTube} />;
}
```

- [ ] Implement 4 visual states (loading, connected, expired, not connected)
- [ ] Use appropriate colors: green, yellow, gray
- [ ] Show expiry countdown for connected state
- [ ] Add "Connect" or "Reconnect" button based on state
- [ ] Make responsive (mobile-friendly)

**Success Criteria:** Component renders all states correctly

**Manual Test:** View in Storybook or browser with different mock states

---

### Task 2.3: Update Playlist Discovery Page
**Time:** 45 min  
**Files:** `src/pages/PlaylistDiscovery.jsx`

**Changes:**
```jsx
import { YouTubeConnectionStatus } from '../components/YouTubeConnectionStatus';
import { useYouTubeAuth } from '../hooks/useYouTubeAuth';
import { useSearchParams } from 'react-router-dom';

export function PlaylistDiscovery() {
  const [searchParams] = useSearchParams();
  const { connected, checkConnection } = useYouTubeAuth();
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Handle OAuth callback success
  useEffect(() => {
    if (searchParams.get('connected') === 'true') {
      setShowSuccessMessage(true);
      checkConnection();
      setTimeout(() => {
        window.history.replaceState({}, '', '/playlist-discovery');
        setShowSuccessMessage(false);
      }, 5000);
    }
  }, [searchParams]);

  async function handleSyncPlaylist(playlistId) {
    await checkConnection();
    if (!connected) {
      alert('Please connect YouTube first');
      return;
    }
    // ... existing sync logic
  }

  return (
    <div>
      <h1>Playlist Discovery</h1>
      {showSuccessMessage && <SuccessAlert />}
      <YouTubeConnectionStatus />
      {/* existing playlist list */}
    </div>
  );
}
```

- [ ] Import new components and hooks
- [ ] Add `<YouTubeConnectionStatus />` at top of page
- [ ] Handle `?connected=true` query param
- [ ] Handle `?error=<code>` query param
- [ ] Show success message for 5 seconds
- [ ] Update `handleSyncPlaylist` to check connection first

**Success Criteria:** Page renders with status indicator, handles OAuth callback

**Manual Test:** Navigate to page, verify status shows

---

### Task 2.4: Update `/playlist-sync` Function
**Time:** 45 min
**Files:** `netlify/functions/playlist-sync.js`

> **Note:** This is a backend Netlify function change, placed here (Phase 2) because it depends on the `refreshYouTubeToken` utility from Task 1.3 and must be complete before integration testing in Phase 3.

**Changes:**
```javascript
import { refreshYouTubeToken } from './utils/refreshYouTubeToken.js';

async function getValidYouTubeToken(userId) {
  // 1. Fetch token from DB
  // 2. Check if expires_at < now + 5 minutes
  // 3. If expiring, call refreshYouTubeToken(userId)
  // 4. Return valid access_token
}

export async function handler(event, context) {
  // ... existing auth code ...

  try {
    // NEW: Get valid token (auto-refresh if needed)
    const youtubeAccessToken = await getValidYouTubeToken(user.id);

    // Use token for YouTube API call
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?...`,
      { headers: { Authorization: `Bearer ${youtubeAccessToken}` } }
    );

    // ... existing processing logic ...
  } catch (error) {
    // Return specific errors for token issues
    if (error.message === 'YouTube not connected') {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'youtube_not_connected',
          message: 'Please connect your YouTube account'
        })
      };
    }
    // ... other error handling
  }
}
```

- [ ] Add `getValidYouTubeToken()` helper function
- [ ] Check token expiry before YouTube API call
- [ ] Auto-refresh if expiring in < 5 minutes
- [ ] Return specific error codes for token issues
- [ ] Handle refresh token missing error

**Success Criteria:** Function uses DB tokens, auto-refreshes when needed

**Test Later:** Will test in Phase 3 integration testing

---

## Phase 3: Integration Testing (2-3 hours)

### Task 3.1: Test First-Time OAuth Flow
**Time:** 30 min

- [ ] Start local dev server: `netlify dev`
- [ ] Sign in to app with **User A** (your main test account)
- [ ] Navigate to Playlist Discovery
- [ ] Verify "Not Connected" status shows
- [ ] Click "Connect YouTube"
- [ ] Complete Google OAuth (use test account)
- [ ] Verify redirect to `/playlist-discovery?connected=true`
- [ ] Verify success message displays
- [ ] Verify "Connected ✓" status shows
- [ ] Check database: Verify token stored with correct fields
- [ ] Verify `expires_at` is ~1 hour in future

**RLS Test (now that we have real data):**
- [ ] Note User A's ID from database
- [ ] Sign out and sign in with **User B** (different account)
- [ ] Open browser console and try to read User A's token:
  ```javascript
  // This should return 0 rows due to RLS
  const { data, error } = await supabase
    .from('user_oauth_tokens')
    .select('*')
    .eq('user_id', '<user_A_id>');
  console.log('User B trying to read User A token:', data);
  // ✅ Should be empty array or null
  ```
- [ ] Sign back in as User A and verify you CAN read your own token

**Success Criteria:** 
- OAuth flow completes
- Token in DB with correct user_id
- UI shows connected
- RLS prevents User B from seeing User A's token ✅

---

### Task 3.2: Test Token Persistence
**Time:** 20 min

- [ ] Close browser completely
- [ ] Reopen and sign in
- [ ] Navigate to Playlist Discovery
- [ ] Verify "Connected ✓" status (no reconnect needed)
- [ ] Verify expiry countdown shows correct days

**Success Criteria:** Token survives browser restart

---

### Task 3.3: Test Playlist Sync with Valid Token
**Time:** 30 min

- [ ] While connected, click "Sync Playlist" on a test playlist
- [ ] Check Netlify function logs for token fetch
- [ ] Verify sync completes successfully
- [ ] Verify recipes appear in database
- [ ] Verify no token refresh occurred (token still valid)

**Success Criteria:** Sync works using database token

---

### Task 3.4: Test Token Expiry & Reconnect
**Time:** 30 min

- [ ] Manually expire token in database:
  ```sql
  UPDATE user_oauth_tokens 
  SET expires_at = NOW() - INTERVAL '1 hour'
  WHERE user_id = '<your-user-id>';
  ```
- [ ] Refresh Playlist Discovery page
- [ ] Verify "Connection Expired" status shows
- [ ] Verify "Reconnect" button appears
- [ ] Click "Reconnect YouTube"
- [ ] Complete OAuth flow
- [ ] Verify new token stored in database
- [ ] Verify new `expires_at` is ~1 hour in future

**Success Criteria:** Expired token detected, reconnect flow works

---

### Task 3.5: Test Token Auto-Refresh During Sync
**Time:** 30 min

- [ ] Set token to expire in 3 minutes:
  ```sql
  UPDATE user_oauth_tokens 
  SET expires_at = NOW() + INTERVAL '3 minutes'
  WHERE user_id = '<your-user-id>';
  ```
- [ ] Wait 4 minutes (token now expired)
- [ ] Click "Sync Playlist"
- [ ] Check Netlify logs: Verify "Token expired, refreshing..." message
- [ ] Verify sync completes successfully
- [ ] Check database: Verify new `access_token` and `expires_at`
- [ ] Verify no error shown to user

**Success Criteria:** Token auto-refreshes during sync, user unaware

---

### Task 3.6: Test Error Handling
**Time:** 30 min

**Test: No Token**
- [ ] Delete token from database
- [ ] Try to sync playlist
- [ ] Verify error: "YouTube not connected"
- [ ] Verify "Connect YouTube" button appears

**Test: Missing Refresh Token**
- [ ] Manually set `refresh_token` to NULL in database
- [ ] Try to sync playlist
- [ ] Verify error: "Please reconnect your YouTube account"

**Test: OAuth Cancellation**
- [ ] Click "Connect YouTube"
- [ ] Cancel Google OAuth screen (click "Cancel")
- [ ] Verify redirect to playlist page
- [ ] Verify "Not Connected" status (no partial token in DB)

**Success Criteria:** All error cases handled gracefully

---

### Task 3.7: Cross-Browser Testing
**Time:** 30 min

- [ ] Test OAuth flow in Chrome
- [ ] Test OAuth flow in Safari
- [ ] Test OAuth flow in Firefox
- [ ] Verify OAuth popup/redirect works in all

**Success Criteria:** Works in all major browsers

---

## Phase 4: Production Deployment (1-2 hours)

### Task 4.1: Run Production Migration
**Time:** 15 min

- [ ] Open production Supabase dashboard
- [ ] Go to SQL Editor
- [ ] Run migration from `schema/migrations/add_user_oauth_tokens.sql`
- [ ] Verify table created
- [ ] Verify RLS policies active
- [ ] Test with production test user

**Success Criteria:** Production database ready

---

### Task 4.2: Verify Production Environment
**Time:** 10 min

**Already configured (verify only):**
- [ ] Confirm Netlify has:
  - ✅ `SUPABASE_SERVICE_ROLE_KEY`
  - ✅ `GOOGLE_CLIENT_ID`
  - ✅ `GOOGLE_CLIENT_SECRET`
  - ✅ `SUPABASE_URL` / `VITE_SUPABASE_URL`
  - ✅ `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`

**Need to add:**
- [ ] Add to Netlify environment variables:
  - `URL=https://your-app.netlify.app`
  
**Verify Google OAuth redirect URIs:**
- [ ] Check Google Console has production callback URL
- [ ] If not, add: `https://your-app.netlify.app/.netlify/functions/auth-youtube-callback`

**Success Criteria:** `URL` env var set, production OAuth redirect whitelisted

---

### Task 4.3: Deploy to Production
**Time:** 15 min

- [ ] Commit all changes:
  ```bash
  git add .
  git commit -m "Add YouTube OAuth token persistence"
  git push origin main
  ```
- [ ] Wait for Netlify deploy to complete
- [ ] Check deploy logs for errors
- [ ] Verify all functions deployed successfully

**Success Criteria:** Clean deploy, no build errors

---

### Task 4.4: Production Smoke Test
**Time:** 30 min

- [ ] Sign in with test account on production
- [ ] Complete full OAuth flow
- [ ] Verify token stored in production database
- [ ] Sync a test playlist
- [ ] Verify sync works
- [ ] Check Netlify function logs for errors
- [ ] Test on mobile device

**Success Criteria:** All features work on production

---

### Task 4.5: Monitor & Document
**Time:** 15 min

- [ ] Set up Netlify function monitoring
- [ ] Document production URLs in README
- [ ] Update project status docs
- [ ] Notify pilot users: "YouTube sync is now reliable!"
- [ ] Monitor for first 24 hours, check logs daily

**Success Criteria:** Monitoring active, users notified

---

## Rollback Plan

If critical issues arise in production:

1. **Immediate:** Revert code deploy in Netlify
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Keep database table** - No need to drop, safe to leave

3. **Notify users** - Email: "Temporary issues with YouTube sync, working on fix"

4. **Debug offline** - Use local environment to fix issues

5. **Redeploy** when fixed

---

## Success Metrics

**Day 1:**
- [ ] All pilot users can connect YouTube
- [ ] Zero critical bugs reported
- [ ] Sync success rate > 95%

**Week 1:**
- [ ] Token persistence rate: 100%
- [ ] No localStorage fallbacks needed
- [ ] Sync success rate > 99%
- [ ] Zero re-authentication requests

**Month 1:**
- [ ] Token refresh working automatically
- [ ] < 1% of users need to reconnect (only if revoked manually)
- [ ] Positive user feedback: "Sync just works now"

---

## Estimated Timeline

| Phase | Time | Cumulative |
|-------|------|------------|
| Phase 1: Backend | 3-4 hours | 3-4 hours |
| Phase 2: Frontend | 2-3 hours | 5-7 hours |
| Phase 3: Testing | 2-3 hours | 7-10 hours |
| Phase 4: Deploy | 1-2 hours | 8-12 hours |

**Total:** 8-12 hours over 2-3 days

**Recommended Schedule:**
- Day 1: Phases 1-2 (Backend + Frontend)
- Day 2: Phase 3 (Testing)
- Day 3: Phase 4 (Deploy + Monitor)

---

## Checkpoints

### End of Phase 1 ✓
- [ ] All backend functions created and compile
- [ ] Database schema deployed
- [ ] Can curl `/auth/youtube/init` successfully

### End of Phase 2 ✓
- [ ] All frontend components created
- [ ] Hook returns expected shape
- [ ] Status indicator renders in all states

### End of Phase 3 ✓
- [ ] Full OAuth flow works locally
- [ ] Token persists across sessions
- [ ] Auto-refresh works during sync
- [ ] All error cases handled

### End of Phase 4 ✓
- [ ] Deployed to production
- [ ] Smoke tests pass
- [ ] Monitoring active
- [ ] Users notified

---

## Next Steps After Completion

1. **Gather Feedback** - Ask pilot users about OAuth UX
2. **Monitor Metrics** - Track OAuth completion rate, sync success rate
3. **Document Learnings** - Create retrospective doc
4. **Plan Next Feature** - Consider Instagram/TikTok OAuth using same pattern

---

**Created:** February 21, 2026  
**Ready to Begin:** Yes ✅
