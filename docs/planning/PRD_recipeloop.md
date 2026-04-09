# Recipe Loop - PRD

## Overview
Recipe Loop turns YouTube cooking playlists into a searchable recipe library with AI-extracted ingredient lists. Users connect their playlists, let the app enrich each video with structured ingredients, and build a grocery list from any recipe in their library.

---

## 1. User Stories

### As a Home Cook

#### Getting Started
- I want to sign in with Google so I don't need to manage a separate account
- I want to connect my existing YouTube cooking playlists so my saved videos become my recipe library automatically
- I want to see my recipes populated without doing any manual data entry

#### Browsing My Library
- I want to see all my recipe videos with their AI-extracted ingredient lists so I know what's in each dish at a glance
- I want to click into a recipe and see the full ingredient list alongside the video
- I want to re-sync a playlist so newly added YouTube videos show up in my library

#### Building a Grocery List
- I want to add any recipe to my grocery list so I can plan a shopping trip across multiple meals
- I want to see all ingredients grouped by recipe so I know which ingredients go with which dish
- I want to check off ingredients as I shop so I can track what I've already picked up
- I want to copy the full list to my clipboard so I can paste it into a notes app or text a family member
- I want my checked items to persist if I close and reopen the app mid-shop
- I want to remove a recipe from my list when I'm done with it

---

## 2. Functional Requirements

_Stub — detail per-feature in individual feature PRDs_

| # | Requirement | Status |
|---|-------------|--------|
| F1 | Google OAuth sign-in via Supabase | Done |
| F2 | YouTube playlist connection and sync | Done |
| F3 | AI ingredient extraction from video transcripts (Gemini) | Done |
| F4 | Recipe library feed with ingredient cards | Done |
| F5 | Recipe detail page | Done |
| F6 | Grocery list — add, view, check off, copy, remove | Done |

---

## 3. Out of Scope (for now)

- Manual recipe entry (no YouTube video required)
- Recipe search / filtering
- Ingredient quantity parsing and unit normalization
- Sharing a grocery list with another user
- Meal planning / calendar view
- Recipe ratings or notes

---

## 4. Data Model

_Stub — see individual feature PRDs and migration files for schema details_

Key tables: `recipes`, `user_recipes`, `user_playlists`, `user_oauth_tokens`, `lists`, `events`

---

## 5. Open Questions

- Should we support non-YouTube recipe sources (blogs, PDFs)?
- Is there a paid tier, and if so what's the feature gate?
- How do we handle videos where no transcript is available?
