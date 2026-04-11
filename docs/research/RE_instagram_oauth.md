# Research: Instagram Saved Collection Monitoring via instagrapi

**Status:** Research Complete
**Date:** 2026-03-28
**Purpose:** Assess feasibility and implementation approach for monitoring a personal Instagram account's saved collections to detect new recipe videos — without Meta app review. The official Instagram API was evaluated and ruled out: it does not expose saved collections at any tier.

---

## TL;DR

- **Official Instagram API ruled out:** The Instagram API with Instagram Login (and all predecessor APIs) cannot access saved collections at any tier. Hard wall — not a permissions issue.
- **instagrapi:** Python library that reverse-engineers Instagram's private mobile API. Supports saved collections (`collections()`, `collection_medias()`) with session-cookie auth. Actively maintained — v2.3.0 released Feb 25, 2026.
- **Recommended approach:** Use instagrapi for personal-account saved collection monitoring. Pair with Supadata for transcript extraction (pass Instagram video URLs). Deploy as a small FastAPI microservice on Railway/Render/Fly.io since instagrapi is Python and the main stack is JS/Node.
- **Risk:** Violates Instagram ToS. Fine for personal/single-account use. Ban risk is manageable with session persistence, low poll rates (≥5 min), and keeping instagrapi up to date for current User-Agent strings.

---

## Sequence Diagram

```
┌──────────┐     ┌──────────────────────┐     ┌────────────────────┐     ┌──────────────┐
│ Scheduler│     │  FastAPI Microservice│     │    instagrapi      │     │  Instagram   │
│ (cron)   │     │  (Python, hosted)    │     │  (Python lib)      │     │  Private API │
└────┬─────┘     └──────────┬───────────┘     └────────┬───────────┘     └──────┬───────┘
     │                      │                          │                         │
     │ 1. GET /diff         │                          │                         │
     ├─────────────────────▶│                          │                         │
     │                      │ 2. load_settings()       │                         │
     │                      ├─────────────────────────▶│                         │
     │                      │ 3. get_timeline_feed()   │                         │
     │                      ├─────────────────────────▶│                         │
     │                      │                          │ 4. GET /feed/timeline/  │
     │                      │                          ├────────────────────────▶│
     │                      │                          │◀────────────────────────┤
     │                      │ (session valid)          │                         │
     │                      │◀─────────────────────────┤                         │
     │                      │                          │                         │
     │                      │ 5. collection_pk_by_name │                         │
     │                      ├─────────────────────────▶│                         │
     │                      │                          │ GET collections/list/   │
     │                      │                          ├────────────────────────▶│
     │                      │                          │◀────────────────────────┤
     │                      │◀─────────────────────────┤ (collection pk)         │
     │                      │                          │                         │
     │                      │ 6. collection_medias(pk) │                         │
     │                      ├─────────────────────────▶│                         │
     │                      │                          │ GET feed/collection/{pk}│
     │                      │                          ├────────────────────────▶│
     │                      │                          │◀────────────────────────┤
     │                      │◀─────────────────────────┤ (List[Media])           │
     │                      │                          │                         │
     │                      │ 7. Diff vs stored snapshot                         │
     │                      │    → new PKs identified  │                         │
     │                      │                          │                         │
     │◀─────────────────────┤ 8. Return new media list │                         │
     │                      │   {pk, url, title,       │                         │
     │                      │    creator, added_at}    │                         │
```

---

## Architecture Diagram

```
                    ┌──────────────────────────────────────────────┐
                    │           recipe-loop-mvp (existing)          │
                    │                                               │
                    │  Netlify Frontend (React/Vite)               │
                    │  Netlify Functions (JS/Node)                 │
                    │  Supabase (Auth + DB)                        │
                    └───────────────────┬──────────────────────────┘
                                        │ HTTP call (on-demand or cron)
                                        │ GET /diff?collection=Recipes
                                        │
                    ┌───────────────────▼──────────────────────────┐
                    │     Instagram Microservice (Python/FastAPI)   │
                    │     Railway / Render / Fly.io                 │
                    │                                               │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │  GET /diff                              │ │
                    │  │  - load_settings("session.json")        │ │
                    │  │  - validate session                     │ │
                    │  │  - collection_medias(pk, amount=0)      │ │
                    │  │  - diff vs stored snapshot              │ │
                    │  │  - return new media list                │ │
                    │  └─────────────────────────────────────────┘ │
                    │                                               │
                    │  ┌─────────────────────────────────────────┐ │
                    │  │  session.json (persisted volume)        │ │
                    │  │  snapshot.json (last known collection)  │ │
                    │  └─────────────────────────────────────────┘ │
                    └───────────────────┬──────────────────────────┘
                                        │
                    ┌───────────────────▼──────────────────────────┐
                    │           Instagram Private API               │
                    │   (reverse-engineered mobile endpoints)       │
                    │   collections/list/                          │
                    │   feed/collection/{pk}/                      │
                    └──────────────────────────────────────────────┘
```

---

## Data Flow Diagram

### Session Lifecycle and Change Detection

```
Session State Machine:
  ├── First Run
  │     └── cl.login(USERNAME, PASSWORD)
  │     └── cl.dump_settings("session.json")  ← persist for all future runs
  │
  ├── Subsequent Runs
  │     └── cl.load_settings("session.json")
  │     └── cl.get_timeline_feed()            ← validates session is still live
  │           ├── OK → proceed to collection fetch
  │           └── LoginRequired / SessionExpired
  │                 └── cl.login(USERNAME, PASSWORD)
  │                 └── cl.dump_settings("session.json")  ← refresh session
  │
  └── Collection Polling Loop
        ├── Every 5–10 min: cl.collection_medias(pk, amount=0)
        ├── Diff returned PKs vs stored snapshot
        │     ├── New PKs → new saves detected
        │     │     └── Pass media URLs to Supadata for transcript
        │     └── Removed PKs → unsaved detected (optional handling)
        └── Update snapshot

Exception Handling Decision Tree:
  ├── RateLimitError        → sleep 1 hour, retry
  ├── PleaseWaitFewMinutes  → sleep 1 hour, retry
  ├── FeedbackRequired      → sleep 12 hours, retry
  ├── ChallengeRequired     → notify user (manual resolution needed)
  ├── ChallengeSelfieCaptcha→ notify user (cannot resolve programmatically)
  ├── AccountSuspended      → alert + stop
  └── LoginRequired         → re-login, re-dump session
```

---

## Problem vs Solution Matrix

### Is instagrapi still working as of 2026?

| Check | Status |
|-------|--------|
| Latest version | v2.3.0 — released Feb 25, 2026 |
| Python support | >= 3.9 (tested through 3.13) |
| Saved collections | Working — `collections()`, `collection_medias()` confirmed functional |
| Feb 2026 breakage | Resolved in v2.3.0 (Instagram rejected old UA strings — fixed) |
| Open issue Mar 2026 | Challenge resolver doesn't handle new `bloks` scraping_warning checkpoint (Issue #2389) — only affects flagged accounts |
| Maintenance | Active — issues receive responses, releases ship in 2026 |

### Collection Method Reference

| Method | Signature | Notes |
|--------|-----------|-------|
| `collections()` | `() -> List[Collection]` | Returns all saved collections on the account |
| `collection_pk_by_name()` | `(name: str) -> int` | Raises `CollectionNotFound` if name doesn't match |
| `collection_medias_by_name()` | `(name: str) -> List[Media]` | Convenience wrapper — name → pk → medias |
| `collection_medias()` | `(pk: int, amount: int = 21, last_media_pk: int = 0) -> List[Media]` | `amount=0` fetches all; paginates automatically |
| `liked_medias()` | `(amount: int = 21) -> List[Media]` | Convenience wrapper for the liked posts collection |
| `media_save()` | `(media_id: str, collection_pk: int = None) -> bool` | Save a media item |
| `media_unsave()` | `(media_id: str, collection_pk: int = None) -> bool` | Unsave a media item |

### Key Gotchas

| Gotcha | Severity | Details |
|--------|----------|---------|
| **Instagram ToS violation** | High | All private API usage violates ToS. Acceptable for personal single-account use; not for multi-user prod. |
| **Account ban risk** | High | Community reports bans at ~400 req/day. Use session persistence, `delay_range`, poll ≥5 min intervals. |
| **User-Agent staleness** | High | Instagram periodically rejects old UA strings. Fixed in v2.3.0 but can recur — pin to latest version. |
| **ChallengeSelfieCaptcha** | High | Cannot be resolved programmatically. Requires human intervention. |
| **Session expiry** | Medium | Sessions expire after days to weeks. Implement credential fallback. |
| **Python-only** | Medium | Stack is JS/Node — requires a separate Python microservice or serverless function. |
| **Bloks challenge resolver (Mar 2026)** | Medium | Open bug — `ChallengeUnknownStep` on `scraping_warning` checkpoint. Only triggers on flagged accounts. |
| **No webhooks** | Low | Polling only. Set intervals ≥5 min per collection. |

---

## Real-World Examples

### Public Repos Using instagrapi (Third-Party, Recent Activity)

**TnYtCoder/InstaPilot**
- [github.com/TnYtCoder/InstaPilot](https://github.com/TnYtCoder/InstaPilot)
- Terminal-based Instagram control tool with ~26 functions: follow/unfollow, like/unlike, media download/upload, user data retrieval
- Last commit: January 2026 — 63 stars

**wezaxy/AI-Powered-Instagram-DM-Bot**
- [github.com/wezaxy/AI-Powered-Instagram-DM-Bot](https://github.com/wezaxy/AI-Powered-Instagram-DM-Bot)
- Auto-responds to Instagram DMs using GPT. Includes proxy support, configurable language, group message controls
- Last commit: July 2025 — 26 stars

**SREEHARI1994/InstagramScraper**
- [github.com/SREEHARI1994/InstagramScraper](https://github.com/SREEHARI1994/InstagramScraper)
- Desktop GUI to download photos, reels, stories, and highlights from accounts. Uses instagrapi for API access
- Last commit: December 2025 — 29 stars

**AL-MARID/Instagram_Automation_Toolkit**
- [github.com/AL-MARID/Instagram_Automation_Toolkit](https://github.com/AL-MARID/Instagram_Automation_Toolkit)
- CLI toolkit for account login, user/media retrieval, engagement automation (likes, comments, follows), DMs, post scheduling. Explicitly includes proxy support
- Last commit: 2025 — 2 stars

**ridhotamma/Project-Roy**
- [github.com/ridhotamma/Project-Roy](https://github.com/ridhotamma/Project-Roy)
- Full-stack automation platform — FastAPI backend, React frontend, Celery task queue, MongoDB, Redis. Multi-account management, content scheduling, analytics
- Last commit: May 2024 — 2 stars

### instagrapi Official Docs

**instagrapi — Getting Started**
- [subzeroid.github.io/instagrapi/getting-started.html](https://subzeroid.github.io/instagrapi/getting-started.html)
- Installation, first login, session persistence pattern

**instagrapi — Collections Usage Guide**
- [subzeroid.github.io/instagrapi/usage-guide/collection.html](https://subzeroid.github.io/instagrapi/usage-guide/collection.html)
- Complete method reference for all collection methods

**instagrapi — Best Practices (Anti-Ban)**
- [subzeroid.github.io/instagrapi/usage-guide/best-practices.html](https://subzeroid.github.io/instagrapi/usage-guide/best-practices.html)
- Max 10 accounts per IP, `delay_range = [1, 3]`, proxy setup, device UUID persistence. SOAX mentioned by name; Webshare recommended by community in [Discussion #434](https://github.com/subzeroid/instagrapi/discussions/434).

**instagrapi — Exception Handling**
- [subzeroid.github.io/instagrapi/usage-guide/handle_exception.html](https://subzeroid.github.io/instagrapi/usage-guide/handle_exception.html)
- Recovery patterns for `RateLimitError`, `FeedbackRequired`, `ChallengeRequired`

**instagrapi — GitHub Repo**
- [github.com/subzeroid/instagrapi](https://github.com/subzeroid/instagrapi)
- ~6,000 stars, MIT license, v2.3.0 Feb 25 2026

### Proxy

**Webshare — Static Residential Proxies**
- [webshare.io/static-residential-proxy](https://www.webshare.io/static-residential-proxy)
- $0.30/IP/month. Fixed ISP IPs (AT&T, Cox, Sprint). Best option for Instagram — consistent IP per session matches real user behavior. Community-recommended in instagrapi [Discussion #434](https://github.com/subzeroid/instagrapi/discussions/434).

**Webshare — Rotating Residential Proxies**
- [webshare.io/residential-proxy](https://www.webshare.io/residential-proxy)
- $3.50/month for 1 GB. 80M+ IPs, 195 countries. Better for broad scraping; less ideal for per-account session consistency.

**Webshare — Proxy List API**
- [apidocs.webshare.io/proxy-list/list](https://apidocs.webshare.io/proxy-list/list)
- Programmatic retrieval of your proxy list. Returns `proxy_address`, `port`, `username`, `password` per entry.

**Webshare Python SDK**
- [pypi.org/project/webshareproxy](https://pypi.org/project/webshareproxy/)
- Thin wrapper to pull proxy list from the API. `pip install webshareproxy`.

**HikerAPI — Commercial SaaS Alternative**
- [hikerapi.com](https://hikerapi.com)
- Commercial wrapper around the same private API. Recommended by instagrapi authors for production. Pay-per-request.

---

## Side-by-Side Comparison

### FastAPI Microservice — Full Implementation with Webshare Proxy

```python
# requirements.txt
# instagrapi==2.3.0
# fastapi
# uvicorn
# webshareproxy

import os, json
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, RateLimitError, FeedbackRequired

SESSION_FILE = "session.json"
SNAPSHOT_FILE = "snapshot.json"
USERNAME = os.environ["IG_USERNAME"]
PASSWORD = os.environ["IG_PASSWORD"]
COLLECTION_NAME = "Recipes"

# Webshare static residential proxy — set in env
# Format: http://username:password@proxy_address:port
# Get credentials from: https://apidocs.webshare.io/proxy-list/list
# Use static residential (not rotating) — Instagram expects consistent IP per session
PROXY = os.environ.get("WEBSHARE_PROXY")
# e.g. "http://username:password@1.2.3.4:8168"
# Rotating endpoint alternative (one IP per request): "http://username:password@p.webshare.io:80"

def get_client():
    cl = Client()
    cl.delay_range = [1, 3]

    # Pin current UA — Instagram rejects stale version strings (broke Feb 2026, fixed in v2.3.0)
    cl.set_user_agent(
        "Instagram 410.0.0.0.96 Android (33/13; 480dpi; 1080x2400; "
        "xiaomi; M2007J20CG; surya; qcom; en_US; 641123490)"
    )

    # Set Webshare residential proxy — keeps a consistent IP per session
    if PROXY:
        cl.set_proxy(PROXY)

    if os.path.exists(SESSION_FILE):
        cl.load_settings(SESSION_FILE)
        try:
            cl.get_timeline_feed()   # validates session is still live
        except LoginRequired:
            cl.login(USERNAME, PASSWORD)
            cl.dump_settings(SESSION_FILE)
    else:
        cl.login(USERNAME, PASSWORD)
        cl.dump_settings(SESSION_FILE)

    return cl

def get_current_pks(cl):
    pk = cl.collection_pk_by_name(COLLECTION_NAME)
    medias = cl.collection_medias(pk, amount=0)   # amount=0 = fetch all pages
    return {str(m.pk): m for m in medias}

def load_snapshot():
    if os.path.exists(SNAPSHOT_FILE):
        with open(SNAPSHOT_FILE) as f:
            return json.load(f)
    return {}

def save_snapshot(pks: dict):
    with open(SNAPSHOT_FILE, "w") as f:
        json.dump({pk: True for pk in pks}, f)

def check_for_new_saves():
    cl = get_client()
    current = get_current_pks(cl)
    previous = load_snapshot()
    new_pks = set(current.keys()) - set(previous.keys())
    new_media = [current[pk] for pk in new_pks]
    save_snapshot(current)
    return new_media

from fastapi import FastAPI
app = FastAPI()

@app.get("/diff")
def diff():
    try:
        new_items = check_for_new_saves()
        return {
            "new_count": len(new_items),
            "items": [
                {
                    "pk": str(m.pk),
                    "url": str(m.thumbnail_url or ""),
                    "creator": m.user.username if m.user else None,
                    "taken_at": str(m.taken_at),
                }
                for m in new_items
            ]
        }
    except RateLimitError:
        return {"error": "rate_limited", "retry_after_minutes": 60}
    except FeedbackRequired:
        return {"error": "feedback_required", "retry_after_minutes": 720}
```

### Webshare Proxy Setup Notes

```
Static residential (recommended for Instagram):
  - Consistent IP per account — matches real user behavior
  - $0.30/IP/month — cheapest option for single-account use
  - Format: http://username:password@proxy_address:port
  - Get list via: https://apidocs.webshare.io/proxy-list/list

Rotating residential (avoid for per-account session):
  - New IP on every request — triggers Instagram suspicious login detection
  - Better suited for broad one-off scraping, not per-session use
  - Endpoint: http://username:password@p.webshare.io:80

Community guidance ([instagrapi Discussion #434](https://github.com/subzeroid/instagrapi/discussions/434)):
  - Use dedicated/unique proxies, not shared datacenter
  - ~8 accounts per proxy address maximum
  - Webshare mentioned alongside SOAX as community-recommended options
  - Webshare free tier (10 datacenter proxies) is fine for single personal account testing
```

---

## Sources

### instagrapi Docs

- [instagrapi Getting Started](https://subzeroid.github.io/instagrapi/getting-started.html)
  - Installation, first login, session persistence pattern

- [instagrapi Collections Usage Guide](https://subzeroid.github.io/instagrapi/usage-guide/collection.html)
  - Full method reference: `collections()`, `collection_medias()`, `collection_pk_by_name()`, `media_save()`, `liked_medias()`

- [instagrapi Best Practices](https://subzeroid.github.io/instagrapi/usage-guide/best-practices.html)
  - Anti-ban measures: max 10 accounts/IP, `delay_range = [1,3]`, proxy setup, session persistence

- [instagrapi Fundamentals](https://subzeroid.github.io/instagrapi/usage-guide/fundamentals.html)
  - Full type inventory including `Collection`, `Media`, `User` objects

- [instagrapi Challenge Resolver](https://subzeroid.github.io/instagrapi/usage-guide/challenge_resolver.html)
  - SMS/email/TOTP handler setup

- [instagrapi Exception Handling](https://subzeroid.github.io/instagrapi/usage-guide/handle_exception.html)
  - Recovery patterns for `RateLimitError`, `FeedbackRequired`, `ChallengeRequired` etc.

- [instagrapi Exceptions Reference](https://subzeroid.github.io/instagrapi/exceptions.html)
  - Full exception type list including `ChallengeSelfieCaptcha`, `SentryBlock`, `AccountSuspended`

- [PyPI: instagrapi](https://pypi.org/project/instagrapi/)
  - Latest: v2.3.0 (Feb 25, 2026). Python >= 3.9.

### instagrapi GitHub Issues & Discussions

- [Issue #2368 — Feb 2026 Login Break](https://github.com/subzeroid/instagrapi/issues/2368)
  - Instagram rejected old UA strings; all v1 calls returned `checkpoint_required`. Fixed in v2.3.0.

- [Issue #2369 — unsupported_version error](https://github.com/subzeroid/instagrapi/issues/2369)
  - Root cause of Feb 2026 breakage confirmed as User-Agent version. Closed/resolved.

- [Issue #2389 — Challenge Unknown Step (Mar 2026)](https://github.com/subzeroid/instagrapi/issues/2389)
  - Open bug: `ChallengeUnknownStep` on new `bloks`-based scraping_warning checkpoint. Only affects flagged accounts.

- [Issue #1885 — Webshare proxy with instagrapi](https://github.com/subzeroid/instagrapi/issues/1885)
  - Real-world attempt using `cl.set_proxy("http://<uid>:<pass>@p.webshare.io:80")`. Proxy format confirmed correct.

- [Discussion #1232 — Rate Limits](https://github.com/subzeroid/instagrapi/discussions/1232)
  - Community-observed ~400 req/day limit before bans triggered

- [Discussion #1905 — Accounts Getting Blocked](https://github.com/subzeroid/instagrapi/discussions/1905)
  - Session persistence critical; accounts banned within days without it

- [Discussion #1288 — Session Login Stability](https://github.com/subzeroid/instagrapi/discussions/1288)
  - Session cookies more stable than repeated credential logins

- [Discussion #434 — Proxy Recommendations](https://github.com/subzeroid/instagrapi/discussions/434)
  - Webshare.io named by community alongside SOAX; ~8 accounts per proxy address recommended

### Third-Party Repos Using instagrapi

- [TnYtCoder/InstaPilot](https://github.com/TnYtCoder/InstaPilot) — terminal Instagram control tool, Jan 2026
- [wezaxy/AI-Powered-Instagram-DM-Bot](https://github.com/wezaxy/AI-Powered-Instagram-DM-Bot) — GPT-powered DM bot with proxy support, Jul 2025
- [SREEHARI1994/InstagramScraper](https://github.com/SREEHARI1994/InstagramScraper) — GUI downloader for reels/stories/highlights, Dec 2025
- [AL-MARID/Instagram_Automation_Toolkit](https://github.com/AL-MARID/Instagram_Automation_Toolkit) — CLI automation toolkit with proxy support, 2025
- [ridhotamma/Project-Roy](https://github.com/ridhotamma/Project-Roy) — full-stack automation platform (FastAPI + React + Celery), May 2024

### Webshare Proxy

- [webshare.io/static-residential-proxy](https://www.webshare.io/static-residential-proxy)
  - $0.30/IP/month. Consistent ISP IPs. Recommended for per-account Instagram sessions.

- [webshare.io/residential-proxy](https://www.webshare.io/residential-proxy)
  - $3.50/month for 1 GB rotating. 80M+ IPs, 195 countries.

- [apidocs.webshare.io/proxy-list/list](https://apidocs.webshare.io/proxy-list/list)
  - Programmatic proxy list retrieval — returns `proxy_address`, `port`, `username`, `password`.

- [help.webshare.io — Rotating Proxy Endpoint](https://help.webshare.io/en/articles/8375645-how-to-connect-through-a-rotating-proxy-endpoint)
  - How to use the `p.webshare.io:80` rotating endpoint.

- [PyPI: webshareproxy](https://pypi.org/project/webshareproxy/)
  - Official Webshare Python SDK for programmatic proxy list access.
