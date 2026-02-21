# Problem Statement: YouTube OAuth Token Persistence

**Status:** Active Issue  
**Created:** February 21, 2026  
**Priority:** Blocking MVP testing  
**Target Fix:** Before pilot user rollout

---

## The Problem

**YouTube playlist sync fails immediately after signing in with Google OAuth.**

### What's Broken

1. User signs in with Google (via Supabase Auth)
2. User navigates to Playlist Discovery page - playlists load successfully
3. User clicks "Connect Playlist" - UI shows as connected
4. User clicks "Sync Playlist" - **sync fails immediately** with error:

```
Unable to Load Playlists
Sync failed: Sync failed

• Make sure you signed in with Google (not email/password)
• Try signing out and signing back in with Google  
• Check that YouTube permissions were granted during sign-in
```

**This happens even though the user just signed in with Google 30 seconds ago.**

### Root Cause

YouTube OAuth provider tokens are stored in browser `localStorage` via a 4-fallback retrieval strategy:

1. Check localStorage
2. Check Supabase session (`session.provider_token`)
3. Try Google direct refresh (using refresh token)
4. Try Supabase session refresh

**The issue:** Supabase's `provider_token` is ephemeral - it disappears after the initial OAuth redirect, even before the first API call. The 4-fallback system can't find a token anywhere, so sync fails.

**Code location:** `src/contexts/AuthContext.jsx` - `getYouTubeToken()` function

### Why This Blocks Launch

- **Can't test core feature:** Playlist sync is part of the primary app feature
- **No workaround:** Re-authenticating doesn't help - same failure
- **Pilot users blocked:** Can't share app with 10 planned pilot users
- **Development velocity:** Can't build features that depend on working YouTube API access

---

## 2. Current Architecture

### How It Works Now

```
┌─────────────────────────────────────────────────────────────┐
│                  USER CLICKS "SIGN IN WITH GOOGLE"          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                  ┌────────────────┐
                  │ Supabase Auth  │
                  │ Google OAuth   │
                  └────────┬───────┘
                           │
               ┌───────────┴───────────┐
               │  Session Created      │
               │  • auth token ✅      │
               │  • provider_token ⚠️  │ (ephemeral - disappears quickly!)
               └───────────┬───────────┘
                           │
                           ▼
            ┌──────────────────────────────┐
            │ TokenStorage.setProviderToken│
            │ Save to localStorage         │
            └──────────┬───────────────────┘
                       │
                       ▼
            ┌──────────────────┐
            │   localStorage   │
            │  provider_token  │  ← Supposed to work, but doesn't
            └──────────────────┘
```

### 4-Fallback Token Retrieval Strategy

In `src/contexts/AuthContext.jsx`, the `getYouTubeToken()` function tries:

1. **localStorage** - Check if token was saved
2. **Supabase session** - Look for `session.provider_token`
3. **Google direct refresh** - Use refresh token to get new access token
4. **Supabase session refresh** - Trigger Supabase to refresh

**Problem:** All 4 strategies fail because:
- localStorage never gets the token (step 1 fails because step 0 failed)
- `provider_token` is already gone from session (step 2 fails)
- No refresh token was captured (step 3 fails)
- Supabase can't refresh what it doesn't have (step 4 fails)

### Why Supabase Provider Tokens Are Ephemeral

Supabase OAuth returns `provider_token` in the session **only during the OAuth callback redirect**. By the time your app code runs and tries to access it, it's often already cleared from the session object. This is by design - Supabase Auth is meant for **app authentication**, not for managing third-party API tokens.

---

## 3. The Solution

### What Changes

**Current flow:**
```
User signs in → Supabase OAuth → provider_token (ephemeral) → localStorage → ❌ Token lost
```

**New flow:**
```
User signs in → Separate YouTube OAuth → Access token → Database storage → ✅ Token persists
```

### Implementation Approach: Dual Auth

**Keep existing Supabase Auth for app login** (no changes to user sign-in)

**Add separate YouTube OAuth flow:**
1. User signs in to app (Supabase Auth) - works as-is
2. User clicks "Connect YouTube" button (new)
3. Separate OAuth flow requests YouTube permissions
4. Netlify function receives callback, stores token in database
5. All YouTube API calls fetch token from database

**New database table:**
```sql
CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  provider TEXT NOT NULL,  -- 'youtube', 'instagram', etc.
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Success Criteria

**Fixed when:**
- ✅ Sign in once, sync playlists reliably for days/weeks
- ✅ Clear UI status showing if YouTube is connected or not
- ✅ Easy "reconnect YouTube" button if something breaks
- ✅ No more "Unable to Load Playlists" errors after fresh sign-in

---

## 4. Next Steps

1. **Create database migration** - Add `user_oauth_tokens` table
2. **Build Netlify function** - Handle YouTube OAuth callback
3. **Update frontend** - Add "Connect YouTube" button and token status indicator
4. **Update sync logic** - Fetch tokens from database instead of localStorage
5. **Test with real YouTube account** - Verify tokens persist across sessions

**Estimated time:** 1-2 days of focused work

---

## 5. Questions to Resolve

1. **Token encryption:** Should tokens be encrypted in the database? (Security vs. complexity trade-off)
2. **Refresh strategy:** Automatic background refresh or on-demand when API calls fail?
3. **UI placement:** Where should "Connect YouTube" button appear? (Playlist page? Profile page?)
4. **Migration:** What happens to current localStorage tokens? (Probably just clear and require reconnect)
5. **Token health monitoring:** Should we track refresh success rates and token expiry patterns? Production apps typically monitor token refresh failures (>99% success rate target), expired refresh tokens (alert if >5% of users affected), and refresh latency (<2s target). This helps catch issues before users report them. *(See: [auth comparison research](../research/2026_02_21_auth_comparison.md#monitoring-requirements))*
   - **Decision:** Netlify function logs + `last_used_at` / `last_refreshed_at` timestamps in DB are sufficient for MVP (<50 users). Manual log review when users report issues. Revisit if user count exceeds 50. See ADR 002 for full monitoring roadmap.
