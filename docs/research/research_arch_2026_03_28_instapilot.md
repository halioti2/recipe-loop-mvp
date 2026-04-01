# Research: InstaPilot — How It Works and Collections Support Assessment

**Status:** Research Complete
**Date:** 2026-03-28
**Repo:** https://github.com/TnYtCoder/InstaPilot
**Purpose:** Document how InstaPilot works (authentication, architecture, feature set) and determine whether it explicitly supports accessing an account's saved collections.

---

## Executive Summary

InstaPilot is a single-file Python CLI tool (~22.5 KB) built on top of instagrapi. It exposes 26 numbered Instagram automation functions via a terminal menu. **It does not support saved collections or bookmarks in any form.** The code itself has not been updated since October 2023 — only README files have been committed since then, including a January 2026 README update that makes the repo appear more recently maintained than it is. Authentication is raw username/password passed directly to `instagrapi`'s `Client.login()` with no session persistence between runs. Several functions contain code-level bugs. Not suitable as a base for saved collection monitoring.

---

## Sequence Diagram

```
┌──────────┐     ┌─────────────────┐     ┌────────────────┐     ┌──────────────┐
│   User   │     │  instapilot.py  │     │   instagrapi   │     │  Instagram   │
│ (Terminal│     │  (single file)  │     │   Client()     │     │  Private API │
└────┬─────┘     └────────┬────────┘     └───────┬────────┘     └──────┬───────┘
     │                    │                      │                      │
     │ python3            │                      │                      │
     │ instapilot.py      │                      │                      │
     ├───────────────────▶│                      │                      │
     │                    │ check deps           │                      │
     │                    │ auto-install if      │                      │
     │                    │ missing (pip3)       │                      │
     │                    │                      │                      │
     │                    │ print ASCII banner   │                      │
     │                    │                      │                      │
     │◀───────────────────┤ prompt: username     │                      │
     ├───────────────────▶│                      │                      │
     │◀───────────────────┤ prompt: password     │                      │
     ├───────────────────▶│                      │                      │
     │                    │ cl = Client()        │                      │
     │                    ├─────────────────────▶│                      │
     │                    │ cl.login(usr, pas)   │                      │
     │                    ├─────────────────────▶│                      │
     │                    │                      │ POST private login   │
     │                    │                      ├─────────────────────▶│
     │                    │                      │◀─────────────────────┤
     │                    │◀─────────────────────┤ (session active)     │
     │◀───────────────────┤ "[+] Login           │                      │
     │                    │  Successful !"       │                      │
     │                    │                      │                      │
     │◀───────────────────┤ print 26-item menu   │                      │
     ├───────────────────▶│ enter choice (1–26)  │                      │
     │                    │                      │                      │
     │                    │ execute function     │                      │
     │                    ├─────────────────────▶│                      │
     │                    │                      ├─────────────────────▶│
     │                    │                      │◀─────────────────────┤
     │                    │◀─────────────────────┤                      │
     │◀───────────────────┤ print result         │                      │
     │                    │                      │                      │
     │◀───────────────────┤ "Continue? (Y/n)"    │                      │
     │     n              │                      │                      │
     ├───────────────────▶│ cl.logout()          │                      │
     │                    ├─────────────────────▶│                      │
     │                    │                      ├─────────────────────▶│
     │                    │                      │◀─────────────────────┤
```

---

## Architecture Diagram

```
InstaPilot/
├── instapilot.py          ← entire application (single file, 22.5 KB)
├── saved_media/           ← download destination (empty, created by clone)
├── DISCLAIMER.md
├── LICENSE (MIT)
└── README.md

No requirements.txt
No config files
No session storage
No proxy config
No .env or secrets management
No tests
```

```
Runtime architecture:

  python3 instapilot.py
        │
        ├── dependency check (importlib.util)
        │     └── pip3 install instagrapi / requests if missing
        │
        ├── Client() — module-level, single global instance
        │
        ├── login(usr, pas) — called once at startup, credentials kept
        │     in module-level variables for full session duration
        │
        ├── menu loop — while True
        │     └── input() → dispatch to one of 26 functions
        │
        └── logout() — called on exit
```

---

## Data Flow Diagram

### Authentication Flow

```
Startup:
  ├── usr = input("username")         ← plaintext, stored as module variable
  ├── pas = input("password")         ← plaintext, no masking, stored as module variable
  ├── cl.login(usr, pas)
  │     ├── Success → print "[+] Login Successful !"
  │     ├── BadPassword → print error, sys.exit()
  │     ├── RateLimitError → print error, sys.exit()
  │     ├── PleaseWaitFewMinutes → print error, sys.exit()
  │     ├── ClientConnectionError → print error, sys.exit()
  │     ├── ChallengeUnknownStep → print error, sys.exit()
  │     └── ProxyAddressIsBlocked → print error, DOES NOT EXIT (bug)
  │
  └── No session persistence — credentials re-entered on every run
      No dump_settings() / load_settings() used anywhere

Shutdown:
  └── cl.logout()
```

### Collections Support Decision Tree

```
Does InstaPilot support saved collections?

  ├── collections()              → NOT CALLED anywhere in instapilot.py
  ├── collection_medias()        → NOT CALLED anywhere in instapilot.py
  ├── collection_pk_by_name()    → NOT CALLED anywhere in instapilot.py
  ├── user_saved_medias()        → NOT CALLED anywhere in instapilot.py
  └── media_save() / unsave()   → NOT CALLED anywhere in instapilot.py

Verdict: Collections are NOT supported. No menu item, no code path, no reference.
```

---

## Problem vs Solution

### Q1: Does InstaPilot support saved collections?

**No.** There is no code in `instapilot.py` that calls any collection-related instagrapi method. The feature simply does not exist in the tool. The underlying `instagrapi` library does support collections, but InstaPilot has not implemented them.

---

### Q2: How does sign-in work?

Raw username and password input via `input()`, passed directly to `instagrapi`'s `Client.login()`. No session caching — credentials must be re-entered every time the script is run. No 2FA support beyond catching `ChallengeUnknownStep` and exiting. No cookie persistence (`dump_settings` / `load_settings` are never called).

This is the least resilient possible login approach — the opposite of what the instagrapi best practices docs recommend.

---

### Q3: Is the code actively maintained?

**No.** The Python source (`instapilot.py`) was uploaded on 2023-10-18 and has never been modified. All commits since then are README updates. The January 2026 commit is a README change only — it creates a false impression of recent maintenance. The code is 2+ years old.

---

### Q4: Is it suitable as a base for saved collection monitoring?

**No**, for three reasons:
1. Collections are not implemented
2. No session persistence — re-login every run would rapidly trigger Instagram's suspicious login detection
3. No proxy support despite mentioning it in error messages — `Client()` is initialized with no proxy config

---

## Real-World Examples

**InstaPilot — GitHub Repo**
- [github.com/TnYtCoder/InstaPilot](https://github.com/TnYtCoder/InstaPilot)
- Single-file Python CLI, 26 functions, MIT license
- Code last updated: 2023-10-18. README last updated: 2026-01-05.

---

## Side-by-Side Comparison

### Full Function List (all 26)

| # | Menu Label | Function | What it does |
|---|-----------|----------|-------------|
| 1 | Follow User | `follow(username)` | Follows a single user by username |
| 2 | Follow User From List | `follow_user_list(filename)` | Reads `.txt` file of usernames, follows all |
| 3 | Unfollow User | `unfollow_user(target)` | Unfollows a single user |
| 4 | Remove Follower | `remove_follower(target)` | Removes one follower from your account |
| 5 | Remove All Followers | `remove_all_followers()` | Bulk-removes every follower |
| 6 | Unfollow All User | `unfollow_all_user()` | Bulk-unfollows everyone you follow |
| 7 | Follow User Following | `follow_user_following(target)` | Follows everyone a target user follows |
| 8 | Follow User Followers | `follow_user_followers(target)` | Follows everyone who follows a target user |
| 9 | Get User Id From Username | `get_user_id_from_username(target)` | Prints numeric user ID |
| 10 | Get Username From User Id | `get_username_from_user_id(target)` | Prints username from ID |
| 11 | User Following Into List | `user_following_into_list(target)` | Exports followings to `.txt` |
| 12 | User Followers Into List | `user_followers_into_list(target)` | Exports followers to `.txt` |
| 13 | Like Media | `like_media(url)` | Likes one post by URL |
| 14 | Like All Media | `like_all_media(target)` | Likes all posts of a user |
| 15 | Unlike Media | `unlike_media(url)` | Unlikes one post |
| 16 | Unlike All Media | `unlike_all_media(target)` | Unlikes all posts of a user |
| 17 | Download Post | `download_post(url)` | Downloads photo to `saved_media/` |
| 18 | Download Reel | `download_reel(url)` | Downloads reel to `saved_media/` |
| 19 | Download Video | `download_video(url)` | Downloads video to `saved_media/` |
| 20 | Upload Post | `upload_post(Path, Caption)` | Uploads photo with caption |
| 21 | Upload Reel | `upload_reel(Path, Caption)` | Uploads reel with caption |
| 22 | Upload Video | `upload_video(Path, Caption)` | Uploads video with caption |
| 23 | Delete Media | `delete_media(url)` | Deletes one of your posts by URL |
| 24 | Mass Media Delete | `mass_delete_media()` | Attempts to delete all your media (bugged — see below) |
| 25 | Media Information | `media_info(url)` | Prints username, likes, comments, caption, views |
| 26 | Comment | `comment(url, comment)` | Posts a comment on a post (bugged — see below) |

### Known Bugs

| Function | Bug |
|----------|-----|
| `mass_delete_media()` | Calls `cl.user_id_from_username()` with no argument — crashes immediately |
| `mass_delete_media()` | Iterates `for media in media_pk` instead of `for media in media_list` — list always empty even if fixed |
| `comment()` | Uses `comment` as both the parameter name and the function name — recursive call causes `TypeError` |
| `user_following_into_list()` | Writes `username` (last loop value) instead of `user_names` to the output file |
| `ProxyAddressIsBlocked` handler | Prints message but does not call `sys.exit()` — execution continues into the menu with a blocked IP |
| `help()` (option 99) | Uses Android `am start` intent — silently fails on Linux/macOS desktop |

### Login Code (exact)

```python
cl = Client()

print("\n\033[33m [+] Login")
usr = input("\n\033[35m username : \033[31m")
pas = input("\033[35m password : \033[31m")

try:
    cl.login(usr, pas)
    print("\n\033[32m [+] Login Successful !")
except instagrapi.exceptions.BadPassword:
    print("\n\033[31m [+] Please Check Your Password !")
    sys.exit()
except instagrapi.exceptions.RateLimitError:
    print("\n\033[31m [+] Too Many Login Attempts, Please Try Later !")
    sys.exit()
except instagrapi.exceptions.PleaseWaitFewMinutes:
    print("\n\033[31m [+] Please Try After Few Minutes !")
    sys.exit()
except instagrapi.exceptions.ClientConnectionError:
    print("\n\033[31m [+] Please Check You Internet Connection !")
    sys.exit()
except instagrapi.exceptions.ChallengeUnknownStep:
    print("\n\033[31m [+] Instagram Needs Phone Number Verification !")
    sys.exit()
except instagrapi.exceptions.ProxyAddressIsBlocked:
    print("\n\033[31m [+] Instagram Has Blocked Your IP Address, Use Proxy To Bypass !")
    # no sys.exit() — bug
except KeyboardInterrupt:
    print("\n\033[31m [+] Keyboard Interrupt : Script Ended !")
    sys.exit()
```

---

## Sources

- [InstaPilot GitHub Repo](https://github.com/TnYtCoder/InstaPilot)
  - Full source, README, commit history

- [instapilot.py (raw source)](https://raw.githubusercontent.com/TnYtCoder/InstaPilot/main/instapilot.py)
  - Confirmed: no collection methods called anywhere in the file

- [instagrapi Collections Usage Guide](https://subzeroid.github.io/instagrapi/usage-guide/collection.html)
  - Reference for the collection methods InstaPilot does not implement
