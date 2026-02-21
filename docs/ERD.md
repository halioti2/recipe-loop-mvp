# Recipe Loop MVP — Entity Relationship Diagram

```mermaid
erDiagram
    AUTH_USERS {
        uuid id PK
        string email
    }

    RECIPES {
        uuid id PK
        text title
        text video_url
        text channel
        text summary
        jsonb ingredients
        text transcript
        text pinned_comment
        text external_link
        text playlist_id
        text source_playlist_id
        text youtube_video_id
        integer playlist_video_position
        uuid user_id
        timestamptz created_at
    }

    USER_PLAYLISTS {
        uuid id PK
        uuid user_id FK
        text youtube_playlist_id
        text title
        text description
        text thumbnail_url
        integer video_count
        boolean sync_enabled
        boolean active
        timestamptz last_synced
        timestamptz created_at
        timestamptz updated_at
    }

    USER_RECIPES {
        uuid id PK
        uuid user_id FK
        uuid recipe_id FK
        uuid playlist_id FK
        integer position_in_playlist
        boolean is_favorite
        text personal_notes
        timestamptz added_at
        timestamptz created_at
        timestamptz updated_at
    }

    PLAYLIST_SYNC_LOGS {
        uuid id PK
        uuid user_id FK
        uuid playlist_id FK
        text youtube_playlist_id
        integer recipes_added
        integer recipes_updated
        integer recipes_skipped
        jsonb errors
        text status
        timestamptz sync_started
        timestamptz sync_completed
        timestamptz created_at
    }

    LISTS {
        uuid id PK
        uuid recipe_id FK
        uuid user_id
        jsonb ingredients
        timestamptz created_at
    }

    EVENTS {
        uuid id PK
        text action
        uuid recipe_id FK
        uuid user_id
        timestamptz timestamp
    }

    AUTH_USERS ||--o{ USER_PLAYLISTS : "connects"
    AUTH_USERS ||--o{ USER_RECIPES : "owns"
    AUTH_USERS ||--o{ PLAYLIST_SYNC_LOGS : "triggers"

    USER_PLAYLISTS ||--o{ USER_RECIPES : "contains"
    USER_PLAYLISTS ||--o{ PLAYLIST_SYNC_LOGS : "logged by"

    RECIPES ||--o{ USER_RECIPES : "linked via"
    RECIPES ||--o{ LISTS : "added to"
    RECIPES ||--o{ EVENTS : "referenced in"
```

---

## Notes

### Global vs user-scoped tables

| Table | Scoped to user? | How |
|---|---|---|
| `recipes` | Loosely — has a `user_id` column but it's legacy | Should be global under Phase 2.3 architecture |
| `user_playlists` | Yes | `user_id` FK → `auth.users` |
| `user_recipes` | Yes | `user_id` FK → `auth.users` |
| `lists` | Yes | `user_id` column (no FK enforced) |
| `events` | Yes | `user_id` column (no FK enforced) |
| `playlist_sync_logs` | Yes | `user_id` FK → `auth.users` |

### Known inconsistencies

- **`recipes.user_id`** is a legacy column. Under the Phase 2.3 architecture, `recipes` is meant to be a global deduplicated table (no user context) — user ownership is tracked entirely via `user_recipes`. The column still exists but conflicts with that design.
- **`lists.user_id` and `events.user_id`** have no foreign key constraint to `auth.users`, unlike the newer tables.
- **RLS policies** are currently permissive (`FOR ALL USING (true)`) — the user_id columns exist but are not enforced at the database level yet.
