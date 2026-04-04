# Grocery List Page - PRD

## Overview
A dedicated page where users view and manage the ingredients from recipes they've added to their grocery list. Ingredients are grouped by recipe, individually checkable, and can be copied to clipboard for use outside the app.

---

## 1. User Stories

### As a Home Cook

#### Viewing the List
- I want to see all recipes I've added to my grocery list, each with their ingredients listed below
- I want to check off individual ingredients as I shop so I can track what I've already picked up
- I want my checked items to persist if I close and reopen the app mid-shop
- I want to see a summary of how many recipes and total ingredients are on my list

#### Managing the List
- I want to remove a recipe (and its ingredients) from my list when I'm done with it
- I want to copy my full grocery list to clipboard so I can paste it into a notes app or message someone

---

## 2. Functional Requirements

| # | Requirement | Status |
|---|-------------|--------|
| F1 | Display list entries grouped by recipe, showing recipe title and its ingredients | Done |
| F2 | Checkbox per ingredient; checked state persists to localStorage | Done |
| F3 | Remove a recipe entry from the list | Done |
| F4 | Copy all ingredients (grouped by recipe) to clipboard | Done |
| F5 | Summary stats: recipe count and total ingredient count | Done |
| F6 | Empty state message when list has no entries | Done |

---

## 3. Out of Scope (for now)

- Creating grocery lists manually (lists are populated from the recipe collection page)
- Merging duplicate ingredients across recipes
- Quantity / unit parsing for ingredients
- Sharing a list with another user
- List history / archive

---

## 4. Data Model

Lists are stored in the `lists` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK to auth.users, RLS-enforced |
| recipe_id | uuid | FK to recipes |
| ingredients | text[] | Copied from recipe at time of add |
| created_at | timestamptz | |

Joined with `recipes(id, title)` at read time.

---

## 5. Open Questions

- Should checked state sync to the database instead of localStorage so it persists across devices?
- Should removing a recipe from the list also uncheck its items, or let localStorage handle cleanup?
- Do we want a "Reset / Clear All" button in addition to per-recipe removal?
