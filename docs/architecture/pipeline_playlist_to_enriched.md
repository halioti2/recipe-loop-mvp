# Pipeline: Playlist Sync → Enrichment

**Last Updated:** 2026-04-01
**Status:** Current

---

## Overview

This document maps the full pipeline from a user syncing a YouTube playlist to having enriched recipes (transcripts + ingredients) stored in the database.

The pipeline is split across **5 Netlify functions** triggered by two explicit user actions in the UI.

---

## Swim Lane Diagram

```
      FRONTEND                      BACKEND                    EXTERNAL APIs           DATABASE
         |                             |                              |                    |
─────────────────────────────── STAGE 1: PLAYLIST SYNC ──────────────────────────────────────────
         |                             |                              |                    |
  click "Sync Playlists"               |                              |                    |
         |── SELECT active playlists ──────────────────────────────────────────────────>|
         |<── user_playlists[] ────────────────────────────────────────────────────────|
         |                             |                              |                    |
         | [loop: each active playlist]|                              |                    |
         |── POST playlist-sync ──────>|                              |                    |
         |                             |── SELECT user_oauth_tokens ──────────────────>|
         |                             |<── access_token (refresh if expiring) ────────|
         |                             |── INSERT playlist_sync_logs ─────────────────>|
         |                             |── GET playlistItems ──────>|                    |
         |                             |<── video[] ───────────────|                    |
         |                             |                              |                    |
         |                             | [loop: each video]          |                    |
         |                             |── SELECT recipes by youtube_video_id ────────>|
         |                             |<── existing recipe or null ─────────────────---|
         |                             |   [if new] INSERT recipes ───────────────────>|
         |                             |── SELECT user_recipes by user+recipe+playlist >|
         |                             |<── existing link or null ──────────────────────|
         |                             |   [if new] INSERT user_recipes ──────────────>|
         |                             |── UPDATE user_playlists (last_synced) ────────>|
         |                             |── UPDATE playlist_sync_logs (completed) ──────>|
         |<── { added, skipped } ──────|                              |                    |
         |                             |                              |                    |
─────────────────────────────── STAGE 2: ENRICHMENT ─────────────────────────────────────────────
         |                             |                              |                    |
  click "Enrich Recipes"               |                              |                    |
         |── POST playlist-enrich ────>|                              |                    |
         |   (batch_size=3, max=15)     |                              |                    |
         |                             |── POST playlist-enrich-finder ──────────────>|
         |                             |<── recipe_ids[] needing transcript/ingredients─|
         |                             |                              |                    |
         |                             | [loop: batches of 3 recipes, 2s between each]  |
         |                             |── POST playlist-enrich-processor              |
         |                             |── SELECT recipes by id ──────────────────────>|
         |                             |<── recipe rows (title, video_url, transcript) ─|
         |                             |                              |                    |
         |                             | [loop: each recipe in batch]                   |
         |                             |                              |                    |
         |                             |  [if transcript missing]     |                    |
         |                             |── GET transcript by videoId >|                    |
         |                             |   (Supadata API)             |                    |
         |                             |<── segments[] ──────────────|                    |
         |                             |   (joined, capped 3000 chars)|                    |
         |                             |                              |                    |
         |                             |  [if ingredients missing AND transcript exists]  |
         |                             |── POST generateContent ─────>|                    |
         |                             |   (Gemini, transcript[:2000])|                    |
         |                             |<── ingredients[] ───────────|                    |
         |                             |                              |                    |
         |                             |── UPDATE recipes (transcript, ingredients) ────>|
         |                             |                              |                    |
         |<── { transcripts_added, ingredients_added, success_rate } ─|                    |
         |── SELECT recipes (refresh) ──────────────────────────────────────────────>|
         |<── enriched recipe list ────────────────────────────────────────────────────|
         |                             |                              |                    |
```

---

## Functions Summary

| Function | Trigger | Role | External APIs | DB Tables |
|---|---|---|---|---|
| `playlist-sync` | HTTP POST (UI button) | Sync YouTube playlist videos into recipes + user_recipes | YouTube Data API | `user_oauth_tokens`, `user_playlists`, `recipes`, `user_recipes`, `playlist_sync_logs` |
| `playlist-enrich` | HTTP POST (UI button) | Orchestrator — batches recipes and calls finder + processor | None | None (delegates) |
| `playlist-enrich-finder` | Called by `playlist-enrich` | Identify recipes needing transcript or ingredients | None | `user_recipes`, `recipes`, `user_playlists` |
| `playlist-enrich-processor` | Called by `playlist-enrich` | Fetch transcripts + extract ingredients via AI | Supadata, Gemini | `recipes` |
| `enrich` | HTTP GET (standalone) | Legacy single-function enrichment (2 recipes at a time) | Supadata, Gemini | `recipes` |
| `transcript-fill` | HTTP GET (standalone) | Legacy transcript-only fill (2 recipes at a time) | Supadata | `recipes` |

> **Note:** `enrich.js` and `transcript-fill.js` are older standalone functions. The active pipeline is the `playlist-enrich` → `playlist-enrich-finder` → `playlist-enrich-processor` chain.

---

## Data Model (Tables Touched)

```
user_oauth_tokens       — YouTube access/refresh tokens per user
user_playlists          — User's synced playlists (active flag controls enrichment scope)
recipes                 — Global recipe store (shared across users)
                          transcript: varchar, capped at 3000 chars
                          ingredients: jsonb array
user_recipes            — Links user ↔ recipe ↔ playlist with position
playlist_sync_logs      — Audit log per sync run
```

---

## Known Limits

| Constraint | Value | Location |
|---|---|---|
| Transcript character cap | 3000 chars | `playlist-enrich-processor.js:135`, `enrich.js:104,134`, `transcript-fill.js:41` |
| Gemini prompt transcript window | 2000 chars | `playlist-enrich-processor.js` (prompt construction) |
| Recipes per enrichment call | 15 max (`max_recipes`) | `playlist-enrich.js` default |
| Recipes per batch | 3 (`batch_size`) | `playlist-enrich.js` default |
| Delay between batches | 2 seconds | `playlist-enrich.js:118` |
| Legacy functions batch size | 2 recipes | `enrich.js:78`, `transcript-fill.js:20` |
