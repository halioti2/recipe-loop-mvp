# ADR 002: Dual Authentication for YouTube OAuth

**Status:** Accepted  
**Date:** February 21, 2026  
**Deciders:** Solo Developer  
**Related Documents:** 
- [RFC: YouTube OAuth Token Persistence](./RFC_youtube_oauth_tokens.md)
- [PRD: YouTube OAuth Persistence](./PRD_youtube_oauth_persistence.md)
- [Research: Dual Auth Feasibility](../research/dual_auth_feasibility_research.md)
- [Research: Auth Comparison](../research/2026_02_21_auth_comparison.md)

---

## Context

YouTube playlist sync fails because Supabase Auth's `provider_token` is ephemeral and disappears after the OAuth redirect. The current 4-fallback localStorage strategy is unreliable, insecure, and prevents cross-device access.

**Problem:** Core feature (playlist sync) is broken and blocking pilot user rollout.

**Research findings:**
- 93% of surveyed Supabase+OAuth projects use separate OAuth flows
- Dual auth pattern is standard for hobbyist → production apps
- Cross-device sync is automatic with database-backed tokens
- Token refresh can be handled on-demand (no background jobs required for MVP)

---

## Decision

Implement **dual authentication architecture**: Supabase Auth for app login + separate YouTube OAuth flow with database token storage.

### Architecture

```
User Login (Supabase Auth)
    ↓
Dashboard
    ↓
"Connect YouTube" button → Separate OAuth flow → Store tokens in database
    ↓
All YouTube API calls fetch tokens from database
```

### Database Schema

```sql
CREATE TABLE user_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'youtube' (extensible to 'instagram', 'tiktok')
  
  -- OAuth tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[],
  
  -- Provider metadata
  provider_user_id TEXT, -- YouTube channel ID
  provider_username TEXT,
  provider_email TEXT,
  
  -- Audit timestamps (sufficient for hobbyist app)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(user_id, provider)
);

-- RLS Policies
ALTER TABLE user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- 4 granular user policies (decided over simpler service-role catch-all)
-- Service role key bypasses RLS entirely, so a service_role policy is redundant.
-- These policies govern client-side access using the anon key.
CREATE POLICY "Users can read own oauth tokens"
  ON user_oauth_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own oauth tokens"
  ON user_oauth_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own oauth tokens"
  ON user_oauth_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own oauth tokens"
  ON user_oauth_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_user_provider ON user_oauth_tokens(user_id, provider);
```

**Rationale for timestamp-only monitoring:**
- Hobbyist app with <50 users initially
- Netlify function logs provide sufficient debugging capability
- Can add `refresh_failures` counter and alerting later if needed
- Timestamps (`created_at`, `last_used_at`, `last_refreshed_at`) provide audit trail

### Implementation Components

1. **Netlify Functions:**
   - `auth-youtube-init.js` - Initiate OAuth flow, return auth URL
   - `auth-youtube-callback.js` - Handle OAuth callback, store tokens in database
   - `auth-youtube-status.js` - Check connection status for UI
   - *(Note: Earlier drafts used `youtube-connect/callback/status` naming. `auth-youtube-*` is the decided convention — the `auth/` prefix groups all auth-related functions and avoids collision with feature functions like `playlist-sync`.)*

2. **Frontend:**
   - `YouTubeConnectionStatus.jsx` + `useYouTubeAuth()` hook - Status indicator covering all 4 visual states (connected, expired, not connected, loading)
   - *(Note: Earlier drafts named this `YouTubeConnectButton.jsx`. The status component is a superset — it includes the connect/reconnect button as one of its states.)*
   - Update `playlist-sync` function to fetch tokens from database

3. **Token Refresh Strategy:**
   - **On-demand refresh** when API call detects expired access token
   - No background jobs (simpler, sufficient for MVP)
   - Log refresh success/failure to Netlify function logs

---

## Consequences

### Positive

✅ **Reliability:** Tokens persist across browser sessions, page refreshes, device switches  
✅ **Security:** Server-side storage with RLS policies instead of localStorage  
✅ **Cross-device:** Automatic sync - works on phone, tablet, desktop without re-auth  
✅ **Scalability:** Same pattern for future providers (Instagram, TikTok, Spotify)  
✅ **Auditability:** Timestamps provide visibility into token lifecycle  
✅ **Error clarity:** Clear error states replace 4-fallback masking  
✅ **User experience:** Typical 60-180 day token lifetime (vs 7-day target)

### Negative

⚠️ **Complexity:** Two auth systems instead of one (Supabase + custom OAuth)  
⚠️ **Development time:** 5-7 days implementation vs continuing with broken system  
⚠️ **User education:** Users must understand "Sign in" vs "Connect YouTube"  
⚠️ **Migration:** Existing localStorage tokens invalidated (users must reconnect)

### Neutral

🔶 **Monitoring:** Starts with basic logging, can add metrics later if scaling  
🔶 **Token encryption:** Plain text in database for MVP (TLS + RLS sufficient), can migrate to Supabase Vault later

---

## Alternatives Considered

### Alternative 1: Continue with localStorage + 4-Fallback Strategy

**Pros:**
- No development work required
- No architecture changes

**Cons:**
- ❌ Feature remains broken
- ❌ Security vulnerabilities (XSS attacks)
- ❌ No cross-device support
- ❌ Token loss on browser clear
- ❌ Complex fallback logic masks errors

**Verdict:** Rejected - does not solve the problem

### Alternative 2: Migrate to NextAuth.js

**Pros:**
- Single OAuth flow (simpler UX)
- Automatic token refresh
- Built-in security best practices

**Cons:**
- ❌ Requires full rebuild (Vite → Next.js)
- ❌ 2-4 weeks of migration work
- ❌ Loses Supabase Auth investment
- ❌ Framework lock-in

**Verdict:** Rejected - too disruptive for existing codebase

### Alternative 3: Migrate to Firebase Auth

**Pros:**
- Native Google OAuth integration
- More reliable provider tokens

**Cons:**
- ❌ Full migration from Supabase (~3 weeks)
- ❌ Different pricing model
- ❌ Ecosystem lock-in

**Verdict:** Rejected - not justified for token management alone

---

## Implementation Plan

**Phase 1: Database (Day 1)**
- Create migration for `user_oauth_tokens` table
- Add RLS policies
- Test with manual token insertion

**Phase 2: Backend (Days 2-3)**
- Build `youtube-connect.js` function
- Build `youtube-callback.js` function
- Build `youtube-status.js` function
- Test OAuth flow end-to-end

**Phase 3: Frontend (Day 4)**
- Create `YouTubeConnectButton` component
- Add connection status indicator to Playlist Discovery page
- Update UI to show "Connect YouTube" vs "YouTube Connected"

**Phase 4: Integration (Day 5)**
- Update `sync-playlist` function to use database tokens
- Implement on-demand token refresh logic
- Remove localStorage token retrieval code

**Phase 5: Testing (Days 6-7)**
- Test cross-device sync (phone + desktop)
- Test token refresh after 1 hour (access token expiry)
- Test error states (revoked access, expired refresh token)
- Pilot with single test user before broader rollout

---

## Success Metrics

**Must achieve:**
- ✅ 100% sync success rate when valid token exists
- ✅ Tokens survive browser refresh and close/reopen
- ✅ Cross-device access works without re-authentication
- ✅ Zero localStorage dependency for OAuth tokens

**Post-launch tracking:**
- Token refresh success rate (target: >95% for MVP, >99% for production)
- User re-authentication frequency (target: <1 per 60 days)
- OAuth connection completion rate (target: >90%)

---

## Monitoring & Observability

**MVP (Hobbyist App):**
- ✅ Netlify function logs (built-in)
- ✅ Database timestamps (`last_used_at`, `last_refreshed_at`)
- ✅ `console.log()` statements for refresh success/failure
- ✅ Manual log review when users report issues

**Future (If scaling beyond 50 users):**
- Add `refresh_failures` counter to schema
- Email alerts for repeated refresh failures
- Weekly summary email of token health
- Consider observability service (Sentry, LogRocket)

---

## Notes

- This decision aligns with 93% of surveyed Supabase+OAuth projects
- Pattern is proven in production hobbyist apps (Spotify playlist managers, calendar sync tools)
- 7-day token lifetime promise is conservative - actual: 60-180 days
- Multi-provider table design allows future expansion (Instagram, TikTok) without schema changes
- Token encryption deferred to later phase (Supabase Vault) - plain text + TLS + RLS sufficient for MVP

---

## References

- [Google OAuth 2.0 Docs](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [Auth Comparison Research](../research/2026_02_21_auth_comparison.md) - Analysis of 15+ similar projects
- [Dual Auth Feasibility Study](../research/dual_auth_feasibility_research.md) - Cross-device and token lifetime analysis
