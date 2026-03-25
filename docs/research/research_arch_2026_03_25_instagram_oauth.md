# Research: Instagram OAuth Integration (Supabase + Netlify Functions)

**Status:** Research Complete
**Date:** 2026-03-25
**Purpose:** Assess feasibility and implementation approach for Instagram OAuth on the same dual-auth stack used for YouTube OAuth. Answer five specific questions about current API options, OAuth flow comparison, stack-specific patterns, gotchas, and account type requirements.

---

## TL;DR

- **Problem:** Instagram deprecated its personal-account-friendly Basic Display API on December 4, 2024. The replacement — "Instagram API with Instagram Login" — requires a Professional account (Business or Creator) and Meta app review.
- **Current:** YouTube OAuth on this project uses Google's standard Authorization Code flow with refresh tokens that last ~6 months. Token storage lives in Supabase; Netlify functions handle the callback and refresh.
- **Recommendation:** Instagram OAuth is implementable on this stack with the same dual-auth pattern, but it carries meaningfully different operational constraints — 60-day token expiry, no offline refresh grant, mandatory Professional account, and Meta app review. These are manageable but cannot be ignored.
- **Decision:** Not yet made. This document supports that decision.

---

## Sequence Diagram

Instagram OAuth with Instagram Login — full flow on Supabase + Netlify:

```
┌──────────┐     ┌──────────┐     ┌─────────────────┐     ┌──────────────┐
│ Browser  │     │ Supabase │     │ Netlify Function │     │  Instagram   │
│          │     │   Auth   │     │                  │     │  OAuth API   │
└────┬─────┘     └────┬─────┘     └────────┬─────────┘     └──────┬───────┘
     │                │                    │                       │
     │ 1. App login   │                    │                       │
     ├───────────────▶│                    │                       │
     │◀───────────────┤                    │                       │
     │  (Supabase JWT)│                    │                       │
     │                │                    │                       │
     │ 2. Click "Connect Instagram"        │                       │
     ├───────────────────────────────────▶│                       │
     │                │                    │ 3. Build auth URL     │
     │                │                    │    + state param      │
     │◀───────────────────────────────────┤                       │
     │ (redirect)     │                    │                       │
     │                │                    │                       │
     │ 4. Instagram consent screen         │                       │
     ├────────────────────────────────────────────────────────────▶│
     │◀────────────────────────────────────────────────────────────┤
     │  (user grants scopes)               │                       │
     │                │                    │                       │
     │ 5. Redirect to /callback?code=...   │                       │
     ├───────────────────────────────────▶│                       │
     │                │                    │ 6. POST to            │
     │                │                    │    api.instagram.com  │
     │                │                    │    /oauth/access_token│
     │                │                    ├───────────────────────▶
     │                │                    │◀───────────────────────
     │                │                    │  (short-lived token,  │
     │                │                    │   ~1hr)               │
     │                │                    │                       │
     │                │                    │ 7. Exchange for       │
     │                │                    │    long-lived token   │
     │                │                    │    GET graph.instagram│
     │                │                    │    .com/access_token  │
     │                │                    ├───────────────────────▶
     │                │                    │◀───────────────────────
     │                │                    │  (long-lived, 60 days)│
     │                │                    │                       │
     │                │ 8. Store token in  │                       │
     │                │    Supabase DB     │                       │
     │                │◀───────────────────┤                       │
     │                │                    │                       │
     │ 9. Redirect → app, "Instagram Connected"                    │
     │◀───────────────────────────────────┤                       │
     │                │                    │                       │

--- BACKGROUND: token refresh (no user interaction) ---

     │                │                    │                       │
     │                │                    │ 10. Before expiry,    │
     │                │                    │     GET refresh_      │
     │                │                    │     access_token      │
     │                │                    ├───────────────────────▶
     │                │                    │◀───────────────────────
     │                │                    │  (new 60-day token)   │
     │                │                    │                       │
     │                │ 11. Update token   │                       │
     │                │     + expiry in DB │                       │
     │                │◀───────────────────┤                       │
```

---

## Architecture Diagram

Token storage and refresh architecture — how it maps onto the existing YouTube dual-auth stack:

```
                         ┌──────────────────────────────────────┐
                         │           Supabase DB                │
                         │                                      │
                         │  oauth_tokens (existing table)       │
                         │  ┌──────────────────────────────┐   │
                         │  │ provider: 'youtube'           │   │
                         │  │ access_token                  │   │
                         │  │ refresh_token  ← long-lived   │   │
                         │  │ expires_at     ← ~1hr         │   │
                         │  └──────────────────────────────┘   │
                         │                                      │
                         │  ┌──────────────────────────────┐   │
                         │  │ provider: 'instagram'  (new)  │   │
                         │  │ access_token   ← IS the       │   │
                         │  │                  long-lived   │   │
                         │  │ refresh_token  ← NULL (n/a)   │   │
                         │  │ expires_at     ← 60 days      │   │
                         │  │ ig_user_id                    │   │
                         │  └──────────────────────────────┘   │
                         └───────────────┬──────────────────────┘
                                         │
              ┌──────────────────────────┼───────────────────────────┐
              │                          │                           │
    ┌─────────▼──────────┐   ┌──────────▼──────────┐   ┌───────────▼──────────┐
    │ Netlify Function    │   │ Netlify Function    │   │ Netlify Function     │
    │ /instagram-oauth-   │   │ /instagram-oauth-   │   │ /instagram-token-    │
    │  init               │   │  callback           │   │  refresh (scheduled  │
    │                     │   │                     │   │  or on-demand)       │
    │ - Build auth URL    │   │ - Receive code      │   │                      │
    │ - Generate state    │   │ - Exchange short →  │   │ - Check expires_at   │
    │ - Redirect user     │   │   long-lived token  │   │ - Call refresh_      │
    │                     │   │ - Store in DB       │   │   access_token       │
    └─────────────────────┘   └─────────────────────┘   │ - Update DB         │
                                                         └──────────────────────┘
```

---

## Data Flow Diagram

### Token Lifecycle State Machine

```
Instagram Access Token Lifecycle:
  ├── Step 1: Short-lived token (~1hr)
  │     └── Received immediately after code exchange
  │     └── Must be upgraded — do not store this
  │
  ├── Step 2: Long-lived token (60 days)
  │     └── Exchange short-lived via GET /access_token
  │     └── THIS is what you store in Supabase
  │     └── No separate refresh_token — the access_token IS the refreshable credential
  │
  └── Step 3: Refresh cycle
        ├── Token must be >= 24 hours old
        ├── Token must not yet be expired
        ├── Call: GET graph.instagram.com/refresh_access_token
        │         ?grant_type=ig_refresh_token
        │         &access_token=<existing_long_lived_token>
        └── Returns a NEW 60-day token (replaces old one)

Decision tree for API calls:
  ├── Is token present in DB?
  │     └── No → Prompt user to connect Instagram
  │
  ├── Is expires_at within 10 days?
  │     └── Yes → Proactively refresh before making API call
  │
  ├── Is token expired?
  │     └── Yes → Was it refreshed recently?
  │           ├── Unknown / no → User must reconnect (re-auth flow)
  │           └── Yes (bug) → Log error, prompt reconnect
  │
  └── Token valid → Proceed with API call
```

### Key Difference from YouTube

```
YouTube:
  access_token  (1 hour)   → refreshed using refresh_token
  refresh_token (6 months) → stored, used to get new access_token
  Two-token system. refresh_token never expires unless revoked.

Instagram:
  access_token  (60 days)  → refreshed using... itself
  refresh_token → DOES NOT EXIST on Instagram API with Instagram Login
  One-token system. The access_token IS the refresh credential.
  If you let it expire, the user must re-authenticate from scratch.
```

---

## Problem vs Solution Matrix

### Q1: What API options exist in 2026?

| API | Status | Account Requirement | Use Case |
|-----|--------|---------------------|----------|
| **Basic Display API** | DEAD — deprecated Dec 4, 2024 | Personal (was) | Read user media |
| **Instagram Graph API** | Active, requires Facebook Page | Business | Full publishing, insights, comments |
| **Instagram API with Instagram Login** | Active, launched July 2024 | Business or Creator Professional | Publishing, read media, comments — no Facebook Page needed |

**Winner for solo MVP:** Instagram API with Instagram Login. It does not require linking a Facebook Page (unlike the older Graph API setup), just a Professional Instagram account.

---

### Q2: How does the OAuth flow compare to YouTube?

| Step | YouTube (Google) | Instagram (Meta) |
|------|-----------------|-----------------|
| Auth endpoint | `accounts.google.com/o/oauth2/auth` | `api.instagram.com/oauth/authorize` |
| Code exchange | POST to `oauth2.googleapis.com/token` | POST to `api.instagram.com/oauth/access_token` |
| Token returned | Short-lived access + long-lived refresh | Short-lived access only (~1hr) |
| Upgrade needed? | No — get refresh_token at exchange | Yes — must call `/access_token` on `graph.instagram.com` for long-lived |
| Token lifespan | Access: 1hr / Refresh: ~6 months | Long-lived access: 60 days |
| Refresh mechanism | POST with `grant_type=refresh_token` + refresh_token | GET with `grant_type=ig_refresh_token` + access_token |
| Offline access param | `access_type=offline` required | Not applicable |
| API base URL | `www.googleapis.com` | `graph.instagram.com` |
| App credentials | Google Cloud Console, Client ID + Secret | Meta Developer App, App ID + Secret |

**Similarity:** Both use OAuth 2.0 Authorization Code flow. The user redirect, state param, callback handling, and database storage pattern are identical. The Netlify function structure maps directly.

**Key difference:** Instagram has no persistent refresh token. You refresh the access token with itself before it expires. If you miss the 60-day window, it's gone — user must re-auth.

---

### Q3: Supabase + Netlify patterns for Instagram OAuth

No widely-cited open source example exists specifically for Instagram + Supabase + Netlify (unlike GitHub or Intercom, which have official Netlify blog posts). However, the pattern from the existing YouTube OAuth implementation on this project maps directly:

| Component | YouTube (existing) | Instagram (proposed) |
|-----------|--------------------|----------------------|
| Init function | `auth-youtube-init` → redirects to Google | `auth-instagram-init` → redirects to `api.instagram.com` |
| Callback function | `auth-youtube-callback` → exchanges code, stores token | `auth-instagram-callback` → exchanges code, upgrades to long-lived, stores token |
| Status check function | `auth-youtube-status` → checks DB | `auth-instagram-status` → same pattern |
| Token storage | `oauth_tokens` table, `provider='youtube'` | Same table, `provider='instagram'`, `refresh_token=null` |
| Refresh trigger | Automatic (access token expires in 1hr, checked per-call) | Proactive schedule needed (expires in 60 days) |
| Auth middleware | Supabase JWT on all function calls | Identical |

The biggest structural addition: Instagram needs a **background refresh job**. Because the 60-day window is so long, users won't trigger API calls frequently enough to catch expiry. A Netlify scheduled function (cron) that runs weekly and refreshes any token within 10 days of expiry is the standard approach.

---

### Q4: Key Gotchas vs YouTube OAuth

| Gotcha | Severity | Details |
|--------|----------|---------|
| **No refresh_token** | High | The single access_token must be refreshed before expiry. Miss the window = user re-auth required. |
| **60-day hard expiry** | High | Unlike YouTube's 6-month refresh tokens, Instagram's 60-day window is strict. Needs proactive background refresh. |
| **Token must be >= 24 hrs old to refresh** | Medium | Cannot refresh immediately after issuing. Build logic to skip refresh attempts on brand-new tokens. |
| **Two-step token issuance** | Medium | Short-lived token from code exchange MUST be upgraded to long-lived token before storing. Storing the short-lived one will cause failures within an hour. |
| **Wrong API base URL** | Medium | Instagram Platform tokens ONLY work on `graph.instagram.com`. Using `graph.facebook.com` endpoints returns "Invalid OAuth access token" — a silent, confusing failure. |
| **New scope names (post-Jan 27, 2025)** | Medium | Old scopes (`instagram_basic`, `instagram_content_publish`) deprecated. New scopes: `instagram_business_basic`, `instagram_business_content_publish`. Using old names causes auth failures. |
| **Meta app review required for production** | High | App stays in "Development mode" (only your own accounts and approved testers) until you submit for review. Review can take days to weeks and requires detailed justification per scope. |
| **Rate limits are per-account, not per-app** | Medium | 200 calls/hour minimum; scales with account impressions: `4800 × (impressions/1000)` per 24hrs. Much lower ceiling than YouTube's quota model for small accounts. |
| **Publishing caps** | Low | 25 feed posts / 25 reels / 50 stories per 24 hours. Not relevant for read-only use cases. |
| **Scope re-authorization triggers full re-auth** | Medium | If you need to add a new scope later (e.g., add `instagram_business_manage_comments` after launch), users must go through the full OAuth flow again. Plan scopes upfront. |
| **App type must be "Instagram" not "Facebook"** | Medium | Create an Instagram-type app in Meta Developer Portal, not a Facebook app. Using Facebook app credentials with Instagram platform endpoints fails. |
| **Deprecated Insights metrics (Jan 2025)** | Low | If using Insights: `video_views`, `email_contacts`, `profile_views` removed from Graph API v21+. |

---

### Q5: Account Type Requirements

| Account Type | API Access | Notes |
|--------------|-----------|-------|
| **Personal Instagram** | None | No official API access since Dec 2024. |
| **Creator (Professional)** | Read access, limited insights | Can read media, basic profile. Cannot use automated posting via API. Can use Instagram API with Instagram Login. |
| **Business (Professional)** | Full access | Read, publish, insights, comments, messaging. Full API capability. |

**For solo MVP use:** A Creator account is sufficient for read-only use cases (fetching user's Reels/videos). If you need to post on behalf of users, they need Business accounts.

Converting a personal account to Creator or Business is free and reversible. The user keeps their username, followers, and content.

**Critical:** This is a user-side requirement, not just a developer-side requirement. Every user of your app must have a Professional Instagram account. This is a meaningful UX friction point that does not exist with YouTube (any account type works).

---

## Real-World Examples

**Instagram Direct Login Implementation Guide (GitHub Gist)**
- [gist.github.com/PrenSJ2/0213e60e834e66b7e09f7f93999163fc](https://gist.github.com/PrenSJ2/0213e60e834e66b7e09f7f93999163fc)
- Published July 2024 (when the new API launched)
- Covers full OAuth flow, two-step token issuance, database schema, React hooks, and publishing workflow
- Uses Python/FastAPI on backend but the token exchange logic is directly portable to Netlify functions
- Most complete public implementation reference for the new API

**Meta Official Reference — OAuth Authorize**
- [developers.facebook.com/docs/instagram-platform/reference/oauth-authorize](https://developers.facebook.com/docs/instagram-platform/reference/oauth-authorize/)
- Authoritative source for scopes, redirect URI requirements, and response format

**Meta Official Reference — Refresh Access Token**
- [developers.facebook.com/docs/instagram-platform/reference/refresh_access_token](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token/)
- Exact endpoint, parameters, and constraints for the refresh flow

**Netlify Serverless OAuth Pattern (General)**
- [netlify.com/blog/2018/07/30/how-to-setup-serverless-oauth-flows-with-netlify-functions-and-intercom](https://www.netlify.com/blog/2018/07/30/how-to-setup-serverless-oauth-flows-with-netlify-functions-and-intercom/)
- Uses Intercom as the provider but the two-function pattern (init + callback) is the same pattern this project already uses for YouTube

---

## Side-by-Side Comparison

### Token Exchange — YouTube vs Instagram

```javascript
// ─── YOUTUBE: Code exchange (one step, gets refresh_token) ───────────────────
// POST https://oauth2.googleapis.com/token
const ytTokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
    grant_type: 'authorization_code',
  }),
})
// Returns: { access_token, refresh_token, expires_in: 3600 }
// Store both. access_token expires in 1hr; refresh_token lasts ~6 months.


// ─── INSTAGRAM: Step 1 — exchange code for short-lived token ─────────────────
// POST https://api.instagram.com/oauth/access_token
const igShortToken = await fetch('https://api.instagram.com/oauth/access_token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
    code,
  }),
})
// Returns: { access_token, user_id }  — expires in ~1 hour. DO NOT store this.

// ─── INSTAGRAM: Step 2 — upgrade to long-lived token (must do immediately) ───
// GET https://graph.instagram.com/access_token
const igLongToken = await fetch(
  `https://graph.instagram.com/access_token` +
  `?grant_type=ig_exchange_token` +
  `&client_secret=${process.env.INSTAGRAM_APP_SECRET}` +
  `&access_token=${igShortToken.access_token}`
)
// Returns: { access_token, token_type: 'bearer', expires_in: 5183944 (~60 days) }
// Store this access_token. expires_in is in seconds.
```

### Token Refresh — YouTube vs Instagram

```javascript
// ─── YOUTUBE: Refresh using refresh_token ────────────────────────────────────
const ytRefresh = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: storedRefreshToken,   // separate, long-lived credential
    grant_type: 'refresh_token',
  }),
})
// Returns new access_token. refresh_token stays the same.


// ─── INSTAGRAM: Refresh using the access_token itself ────────────────────────
// Constraints: token must be >= 24hrs old AND not yet expired
const igRefresh = await fetch(
  `https://graph.instagram.com/refresh_access_token` +
  `?grant_type=ig_refresh_token` +
  `&access_token=${storedAccessToken}`   // the long-lived token refreshes itself
)
// Returns: { access_token (NEW), token_type, expires_in }
// Update DB with new access_token and new expires_at.
// Old token is now invalid.
```

### Supabase Token Storage Schema

```sql
-- Existing youtube row pattern (in oauth_tokens or equivalent):
-- provider='youtube', access_token, refresh_token (not null), expires_at (~1hr)

-- New instagram row:
INSERT INTO oauth_tokens (
  user_id,
  provider,            -- 'instagram'
  access_token,        -- the long-lived token
  refresh_token,       -- NULL — Instagram has no separate refresh token
  expires_at,          -- NOW() + INTERVAL '60 days'
  ig_user_id,          -- Instagram user ID (separate from Supabase user_id)
  username,            -- for display
  created_at,
  updated_at
)
```

### Required Scopes

```
// YouTube (current):
scope = 'https://www.googleapis.com/auth/youtube.readonly'

// Instagram (new, post-Jan 27 2025 names):
scope = 'instagram_business_basic'                // required: core access
scope += ',instagram_business_content_publish'    // if publishing needed
scope += ',instagram_business_manage_comments'    // if comment access needed
scope += ',instagram_business_manage_messages'    // if DM access needed

// For read-only MVP (fetching reels/videos): instagram_business_basic only
```

---

## Sources

- [Update on Instagram Basic Display API — Meta for Developers (Sep 2024)](https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api/)
  - Official Meta announcement of the December 4, 2024 deprecation deadline
  - Confirms no direct replacement for personal account API access
  - Directs developers to Instagram API with Instagram Login for Professional accounts

- [Instagram API with Instagram Login — Meta Official Docs](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
  - Authoritative source on current scopes, account requirements, and capabilities
  - Confirms new scope names (instagram_business_*) required post-Jan 27, 2025

- [Refresh Access Token — Meta Official Docs](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token/)
  - Exact endpoint, parameters, and constraints (token must be >= 24hrs old, not expired)
  - Confirms 60-day validity window on refreshed tokens

- [Instagram Direct Login Implementation Guide (GitHub Gist, Jul 2024)](https://gist.github.com/PrenSJ2/0213e60e834e66b7e09f7f93999163fc)
  - Most complete public implementation reference for the new API
  - Covers two-step token issuance, DB schema, React hooks, publishing workflow
  - Documents the "wrong base URL" gotcha (api.instagram.com vs graph.instagram.com)

- [Instagram Graph API Complete Developer Guide 2026 — Zernio](https://zernio.com/blog/instagram-graph-api)
  - Rate limit formulas: 200/hr minimum, scales with impressions
  - Publishing caps: 25 feed/25 reels/50 stories per 24hrs
  - App review process and timeline expectations

- [Instagram API Rate Limits — Marketing Scoop 2025](https://www.marketingscoop.com/marketing/instagrams-api-rate-limits-a-deep-dive-for-developers-and-marketers-in-2024/)
  - Confirms 2025 rate limit reduction from 5,000 to 200 calls/hour with no notice
  - Details X-Business-Use-Case-Usage header monitoring approach

- [How to automatically refresh Instagram API credentials — n8n Community](https://community.n8n.io/t/how-to-automatically-refresh-oauth2-api-credentials-specifically-credentials-for-instagram-api-with-instagram-login/186049)
  - Documents the real-world pain of Instagram's 60-day token expiry in production
  - Confirms no built-in automatic refresh mechanism in generic OAuth2 tooling
  - Underscores the need for a custom proactive refresh implementation

- [Serverless OAuth Flows with Netlify Functions — Netlify Blog](https://www.netlify.com/blog/2018/07/30/how-to-setup-serverless-oauth-flows-with-netlify-functions-and-intercom/)
  - Reference for the two-function init+callback pattern applicable to any OAuth provider
  - Same pattern already used for YouTube OAuth on this project
