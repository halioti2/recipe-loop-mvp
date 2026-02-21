# PRD: Persistent YouTube OAuth Token Storage

**Status:** Draft  
**Created:** February 21, 2026  
**Owner:** Solo Developer  
**Target Release:** Before Pilot User Rollout

---

## 1. Feature Overview

### What We're Building

A reliable YouTube OAuth token management system that stores tokens in the database instead of browser localStorage, ensuring users can sync playlists without re-authenticating on every session.

### Why We're Building It

**Current Problem:** YouTube playlist sync fails immediately after sign-in because Supabase's `provider_token` is ephemeral and localStorage-based fallback strategies don't capture it in time.

**User Impact:** Core feature (playlist sync) is completely broken. Cannot test app or share with pilot users.

### Success Metrics

- ✅ **Token persistence:** Tokens survive browser refresh, clear data, and device switches
- ✅ **Reliability:** 100% sync success rate after initial YouTube connection
- ✅ **User clarity:** Users always know their YouTube connection status
- ✅ **Time saved:** Zero re-authentications needed for at least 7 days

---

## 2. User Stories

### Primary User Story
```
As a user who has signed in to the app,
I want to connect my YouTube account once,
So that I can sync playlists reliably without re-authenticating.
```

**Acceptance Criteria:**
- YouTube connection is separate from app login
- Token persists across browser sessions
- Sync works immediately after connecting YouTube
- Connection lasts at least 7 days before needing refresh

### Error Recovery Story
```
As a user whose YouTube token has expired,
I want to see a clear status indicator and reconnect button,
So that I can quickly restore access without debugging or contacting support.
```

**Acceptance Criteria:**
- Visual indicator shows token status (connected/expired/missing)
- One-click reconnect button appears when token is invalid
- After reconnect, sync works immediately
- Clear error messages explain what happened

### Cross-Device Story (Future)
```
As a user who uses the app on multiple devices,
I want my YouTube connection to work everywhere,
So that I don't need to reconnect on each device.
```

**Acceptance Criteria:**
- Token stored in database (device-agnostic)
- Sign in on any device → YouTube already connected
- *(Note: This works automatically with DB storage approach)*

---

## 3. User Flows

### Happy Path: First-Time YouTube Connection

```
1. User signs in to app (Supabase Auth - existing flow)
   ↓
2. User navigates to Playlist Discovery page
   ↓
3. User sees "Connect YouTube" button with status indicator showing "Not Connected"
   ↓
4. User clicks "Connect YouTube"
   ↓
5. User redirected to Google OAuth consent screen
   ↓
6. User grants YouTube permissions
   ↓
7. User redirected back to app → Token stored in database
   ↓
8. Status indicator changes to "Connected ✓"
   ↓
9. User can now sync playlists successfully
```

**Success State:** YouTube connection persists across all future sessions until token expires (60+ days typical for Google tokens).

### Happy Path: Returning User

```
1. User signs in to app (days/weeks later)
   ↓
2. User navigates to Playlist Discovery page
   ↓
3. Status indicator shows "Connected ✓" (token from database)
   ↓
4. User syncs playlists → Works immediately (no reconnect needed)
```

### Error Path: Expired Token

```
1. User signs in to app
   ↓
2. User navigates to Playlist Discovery page
   ↓
3. Status indicator shows "Expired ⚠️"
   ↓
4. User clicks "Sync Playlist"
   ↓
5. System detects expired token
   ↓
6. Error message appears:
   "YouTube connection expired. Click 'Reconnect YouTube' to restore access."
   ↓
7. User clicks "Reconnect YouTube" button
   ↓
8. OAuth flow repeats → New token stored
   ↓
9. Status indicator shows "Connected ✓"
   ↓
10. User syncs playlists → Works
```

### Error Path: Missing Token (New Device)

```
1. User signs in on new device
   ↓
2. User navigates to Playlist Discovery page
   ↓
3. Status indicator shows "Not Connected"
   ↓
4. User clicks "Sync Playlist"
   ↓
5. Error message appears:
   "YouTube not connected. Click 'Connect YouTube' to enable playlist sync."
   ↓
6. User clicks "Connect YouTube"
   ↓
7. [Same as Happy Path First-Time Connection]
```

---

## 4. UI Requirements

### 4.1 YouTube Connection Status Indicator

**Location:** Top of Playlist Discovery page, near navigation or profile area

**Visual States:**

```
┌─────────────────────────────────────┐
│ 🟢 YouTube Connected                │  ← Green, shows last sync time
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🟡 YouTube Connection Expired       │  ← Yellow, shows "Reconnect" button
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ⚪ YouTube Not Connected            │  ← Gray, shows "Connect" button
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🔴 YouTube Connection Error         │  ← Red, shows error details + retry
└─────────────────────────────────────┘
```

**Behavior:**
- Status checks on page load
- Updates in real-time after OAuth flow completes
- Clickable to expand details (token expiry date, scopes granted)

### 4.2 Connect YouTube Button

**Location:** 
- Primary: Playlist Discovery page (where sync happens)
- Secondary: Profile/Settings page (for manual management)

**Button States:**

```
Primary State (Not Connected):
┌─────────────────────────────────────┐
│  🔗 Connect YouTube                 │  ← Blue, prominent
└─────────────────────────────────────┘

Reconnect State (Expired):
┌─────────────────────────────────────┐
│  🔄 Reconnect YouTube               │  ← Orange, urgent but not alarming
└─────────────────────────────────────┘

Connected State:
┌─────────────────────────────────────┐
│  ✓ YouTube Connected                │  ← Green, disabled/info only
└─────────────────────────────────────┘
```

**Click Behavior:**
- Opens Google OAuth consent screen in same window
- After authorization, redirects back to original page
- Shows loading state during OAuth flow
- Displays success message after connection

### 4.3 Error Messages

**Token Expired:**
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️  YouTube Connection Expired                         │
│                                                         │
│ Your YouTube access expired. This happens after 60     │
│ days or if you revoked permissions.                    │
│                                                         │
│ [ Reconnect YouTube ]                                  │
└─────────────────────────────────────────────────────────┘
```

**Token Missing:**
```
┌─────────────────────────────────────────────────────────┐
│ 🔗  YouTube Not Connected                              │
│                                                         │
│ Connect your YouTube account to sync playlists.        │
│                                                         │
│ [ Connect YouTube ]                                    │
└─────────────────────────────────────────────────────────┘
```

**Sync Failed (Detailed):**
```
┌─────────────────────────────────────────────────────────┐
│ ❌  Playlist Sync Failed                               │
│                                                         │
│ Couldn't sync "Dinner Recipes" playlist.               │
│                                                         │
│ Reason: YouTube token expired                          │
│                                                         │
│ [ Reconnect YouTube ]  [ Try Again ]                   │
└─────────────────────────────────────────────────────────┘
```

### 4.4 Success Confirmations

**After Connecting YouTube:**
```
┌─────────────────────────────────────────────────────────┐
│ ✅  YouTube Connected Successfully!                     │
│                                                         │
│ You can now sync playlists. Your connection will last  │
│ for 60 days before needing to reconnect.               │
│                                                         │
│ [ Dismiss ]                                            │
└─────────────────────────────────────────────────────────┘
```

### 4.5 Wireframe: Playlist Discovery Page Unlinked (Updated)

```
┌─────────────────────────────────────────────────────────────┐
│  Recipe Loop MVP                        [Profile] [Sign Out] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Playlist Discovery                                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚪ YouTube Not Connected         [Link Account]             │ ← NEW: Status indicator
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Your Playlists (0)                                          │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 Wireframe: Playlist Discovery Page (Updated)

```
┌─────────────────────────────────────────────────────────────┐
│  Recipe Loop MVP                        [Profile] [Sign Out] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Playlist Discovery                                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🟢 YouTube Connected                                  │   │ ← NEW: Status indicator
│  │ Last synced: 2 hours ago                             │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Your Playlists (3)                                          │
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Dinner Ideas   │  │ Quick Meals    │  │ Desserts     │  │
│  │ 23 videos      │  │ 15 videos      │  │ 8 videos     │  │
│  │ [Sync Now]     │  │ [Sync Now]     │  │ [Sync Now]   │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
│                                                               │
│  [ + Add New Playlist ]                                      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 4.7 Wireframe: Playlist Discovery Page Connection Expired (Updated)

```
┌─────────────────────────────────────────────────────────────┐
│  Recipe Loop MVP                        [Profile] [Sign Out] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Playlist Discovery                                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🟡 YouTube Connection Expired           [Reconnect]  │   │ ← NEW: Status indicator
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Your Playlists (3)                                          │
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Dinner Ideas   │  │ Quick Meals    │  │ Desserts     │  │
│  │ 23 videos      │  │ 15 videos      │  │ 8 videos     │  │
│  │ [Sync Now]     │  │ [Sync Now]     │  │ [Sync Now]   │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 4.7 Wireframe: Playlist Discovery Page Connection Expired (Updated)

```
┌─────────────────────────────────────────────────────────────┐
│  Recipe Loop MVP                        [Profile] [Sign Out] │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Playlist Discovery                                          │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🔴 YouTube Connection Error           [Try again]    │   │ ← NEW: Status indicator
│  │ Details                                              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
│  Your Playlists (3)                                          │
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Dinner Ideas   │  │ Quick Meals    │  │ Desserts     │  │
│  │ 23 videos      │  │ 15 videos      │  │ 8 videos     │  │
│  │ [Sync Now]     │  │ [Sync Now]     │  │ [Sync Now]   │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
│                                                               │
│                                                               │
│                                                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Acceptance Criteria

### Must Have (MVP)

- [ ] **Separate OAuth Flow:** YouTube connection is independent of app sign-in
- [ ] **Database Storage:** Tokens stored in `user_oauth_tokens` table (not localStorage)
- [ ] **Persistent Tokens:** Tokens survive browser refresh and close/reopen
- [ ] **Status Indicator:** Visual feedback shows connection status on Playlist discovery Page
- [ ] **One-Click Connect:** Single button initiates YouTube OAuth flow
- [ ] **One-Click Reconnect:** Single button restores expired connection
- [ ] **Error Clarity:** Specific error messages explain what went wrong and how to fix
- [ ] **Sync Reliability:** 100% success rate when token is valid
- [ ] **Token Refresh:** Automatic token refresh when possible (on-demand fallback)

### Should Have (Soon After MVP)

- [ ] **Token Expiry Warning:** Notify users 7 days before token expires
- [ ] **Manual Disconnect:** Button to revoke YouTube connection
- [ ] **Connection History:** Log of when YouTube was connected/disconnected
- [ ] **Scope Display:** Show what permissions were granted

### Nice to Have (Future)

- [ ] **Multi-Provider:** Support Instagram, TikTok OAuth using same pattern
- [ ] **Token Analytics:** Track token usage, refresh patterns, failure rates
- [ ] **Background Refresh:** Proactive token refresh before expiry
- [ ] **Admin Panel:** View/revoke tokens for all users (if multi-user)

---

## 6. Out of Scope (This Release)

### Not Building Now

❌ **Email notifications** when token expires (low priority for solo dev)  
❌ **OAuth for other providers** (Instagram, TikTok) - future feature  
❌ **Token encryption** at rest (may add later if needed)  
❌ **Multiple YouTube accounts** per user (1:1 relationship for MVP)  
❌ **Granular permission management** (all-or-nothing for now)  
❌ **Token revocation API** (just delete from DB for MVP)

### Why Out of Scope

These features add complexity without solving the immediate problem (broken sync). Once core token persistence works reliably, we can iterate on UX improvements.

---

## 7. Technical Constraints

### Must Work With

- **Supabase Auth:** Existing app authentication (don't break this)
- **Netlify Functions:** Serverless backend (OAuth callback must be stateless)
- **YouTube Data API v3:** Google's OAuth 2.0 flow
- **React + Vite:** Frontend stack (no breaking changes to routing)

### Performance Requirements

- **OAuth Flow:** Complete in < 5 seconds (depends on Google, not us)
- **Token Retrieval:** < 100ms from database
- **Status Check:** < 200ms on page load
- **Sync Operation:** No slower than current implementation

### Security Requirements

- **HTTPS Only:** OAuth redirects require secure connection
- **CSRF Protection:** State parameter in OAuth flow
- **Token Isolation:** RLS policies ensure users only see their tokens
- **Scope Limitation:** Request minimum YouTube permissions needed (read-only)

---

## 8. Success Metrics (Post-Launch)

### Quantitative

- **Token Persistence Rate:** 100% of tokens survive browser refresh
- **Sync Success Rate:** 100% when valid token exists
- **Re-auth Frequency:** < 1 per user per 60 days (token lifetime)
- **OAuth Flow Completion:** > 95% of users complete connection

### Qualitative

- **User Feedback:** "Playlists just work now" vs "always broken"
- **Support Tickets:** Zero auth-related issues during pilot
- **Developer Experience:** "Token management is no longer a pain point"

---

## 9. Open Questions

### Need to Decide Before Implementation

1. **UI Placement:** Should "Connect YouTube" button be:
   - Only on Playlist Discovery page (where it's needed)?
   - Also in Profile/Settings (centralized management)?
   - **Decision** Playlist Discovery - Settings does not exist yet.

2. **Error Recovery:** When sync fails due to expired token:
   - Auto-redirect to OAuth flow?
   - Show error + require manual reconnect?
   - **Recommendation:** Manual reconnect (less disruptive)
   - **Decision** Manual reconnect.

3. **Token Refresh Strategy:**
   - Background job refreshes all tokens nightly?
   - On-demand refresh when API call fails?
   - **Recommendation:** On-demand (simpler, no cron jobs)
   - **Decision** On-Demand 

4. **Migration Strategy:** Existing localStorage tokens:
   - Try to migrate to database?
   - Just expire and require reconnect?
   - **Recommendation:** Expire and reconnect (clean slate)
   - **Decision** Expire and reconnect

5. **Token Encryption:** Store tokens plain text or encrypted?
   - **Recommendation:** Plain text for MVP (Supabase already has RLS + HTTPS)
   - **Decision** Plain text for MVP

---

## 10. Next Steps

### After PRD Approval

1. **Create Tech Spec** (`tech_spec_youtube_oauth.md`)
   - Database schema details
   - API contracts for Netlify functions
   - Frontend component specifications

2. **Create ADR** (`ADR_002_dual_auth_oauth.md`)
   - Document why we chose dual auth over alternatives
   - Explain trade-offs (complexity vs reliability)

3. **Create Implementation Checklist** (`implementation_checklist_oauth.md`)
   - Ordered build steps
   - Testing strategy for each step
   - Rollback plan

4. **Begin Implementation**
   - Start with database migration
   - Then backend (Netlify functions)
   - Then frontend (UI components)
   - Finally integration testing

---

## References

- **Problem Statement:** [`RFC_youtube_oauth_tokens.md`](./RFC_youtube_oauth_tokens.md)
- **Research Analysis:** [`docs/research/2026_02_21_auth_comparison.md`](../research/2026_02_21_auth_comparison.md)
- **Current Auth Code:** `src/contexts/AuthContext.jsx`
- **Playlist Sync Function:** `netlify/functions/playlist-sync.js`
