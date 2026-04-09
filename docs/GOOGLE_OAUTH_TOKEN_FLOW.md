# Google OAuth & Token Flow

## The Problem

Users have to re-authenticate with Google every time they want to view their YouTube playlists. This happens because the app triggers a fresh OAuth flow each visit instead of storing and reusing the tokens from the first login.

---

## How the Current Flow Works

### Actors
- **User** — the person using the app
- **Browser** — the client running the app
- **Google** — handles identity verification and issues tokens
- **Supabase** — handles the OAuth callback, creates and manages app sessions
- **Your App** — `grocery-loop-mvp-site.netlify.app`

### Flow

```
[User - not authenticated, no session]
            │
            │ clicks "Sign in with Google"
            │ browser sends request to Google with:
            │ client_id, scopes, redirect_uri, state
            ▼
[Google - serves Account Chooser / Login screen]
            │
            │ user selects account and approves permissions
            ▼
[Google - generates a one-time code]
            │
            │ redirects browser to Supabase callback URL
            │ with: ?code=xxx&state=xxx
            ▼
[Supabase - receives the code]
            │
            │ server-to-server request to Google:
            │ "exchange this code for real tokens"
            ▼
[Google - validates code, returns tokens]
            │
            │ ID token (JWT) — contains name and email
            │ access token  — lets you call Google APIs now
            │ refresh token — lets you get new access tokens later
            │ (only returned because access_type=offline was set)
            ▼
[Supabase - processes tokens]
            │
            │ decodes ID token → creates or finds user in DB
            │ creates its own Supabase session (its own JWT)
            │ makes provider_token and provider_refresh_token
            │ available on the session object temporarily
            ▼
[Supabase - redirects to your app]
            │
            │ user lands on grocery-loop-mvp-site.netlify.app
            │ Supabase session saved in browser localStorage
            ▼
[Your App - user is now authenticated]
            │
            │ ⚠️ provider_refresh_token is available HERE
            │ but the app is not capturing or storing it
            ▼
[User returns to site]
            │
            │ Supabase session still valid → user is logged in
            │ but provider_refresh_token is gone
            │ app triggers a new OAuth flow to get YouTube access
            │ user sees the Google permissions screen again
```

---

## What a Scope Is

A scope is a permission label that tells Google what your app is allowed to do on the user's behalf. You include a list of scopes when starting the OAuth flow and Google shows the user exactly what they are agreeing to.

| Scope | What it allows |
|---|---|
| `email` | Read the user's email address |
| `profile` | Read the user's name and profile picture |
| `youtube.readonly` | Read the user's YouTube account and playlists |

**Identity scopes** (`email`, `profile`) are one-time — Google confirms who the user is and your app never needs to call Google again for that purpose. Supabase takes over session management from that point.

**API scopes** (`youtube.readonly`) require ongoing access — your app needs to keep calling Google's API on the user's behalf, so you need tokens that last beyond the initial login.

---

## Two Separate Token Systems

| | Supabase tokens | Google provider tokens |
|---|---|---|
| Purpose | Keep user logged into your app | Call Google APIs (YouTube etc.) |
| Managed by | Supabase automatically | You — must store and refresh manually |
| Auto-refreshed | Yes | No |
| Stored where | Supabase DB + browser localStorage | Nowhere currently — this is the bug |

---

## The Fix

### 1. Tokens are already being requested correctly

The OAuth URL already includes `access_type=offline`, `prompt=consent`, and `youtube.readonly` — meaning Google is already returning a refresh token. The problem is it is never captured.

### 2. Capture the refresh token immediately after login

```typescript
const { data, error } = await supabase.auth.getSession();

const providerToken = data.session?.provider_token;
const providerRefreshToken = data.session?.provider_refresh_token;

// Save to your own DB table immediately
await supabase.from('user_tokens').upsert({
  user_id: data.session.user.id,
  access_token: providerToken,
  refresh_token: providerRefreshToken,
  expires_at: Date.now() + 3600 * 1000, // access token lasts ~1 hour
});
```

### 3. Use the stored refresh token going forward

```typescript
const { data: tokenRow } = await supabase
  .from('user_tokens')
  .select('access_token, refresh_token, expires_at')
  .eq('user_id', userId)
  .single();

// If access token is expired, get a new one silently
if (Date.now() > tokenRow.expires_at) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const { access_token } = await response.json();

  // Update stored access token
  await supabase.from('user_tokens').update({
    access_token,
    expires_at: Date.now() + 3600 * 1000,
  }).eq('user_id', userId);
}

// Now call YouTube API — user never sees a login prompt again
```

---

## Result After Fix

| | Before | After |
|---|---|---|
| Token storage | Never stored | Saved to DB on first login |
| Per-visit auth | Full OAuth flow every time | Silent background refresh |
| Consent screen | Every visit | First login only |
| User experience | Friction every visit | Seamless |
