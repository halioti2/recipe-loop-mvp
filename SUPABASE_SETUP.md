# Supabase Database Setup Guide

This document outlines the complete database schema and configuration required for the Recipe Loop MVP application.

## Overview

The application uses Supabase (PostgreSQL) as its primary database with the following core functionality:
- Recipe storage and management (with enhanced metadata)
- Grocery list generation
- Event tracking and analytics
- Multi-user support capability
- Real-time data synchronization

## Database Schema (Verified from Production Backup)

**Note:** This schema is based on the actual production database backup (`db_cluster-06-07-2025@13-25-52.backup`) and reflects the current state of your live system.

**🗂️ Complete SQL Schema:** See [`database_schema.sql`](./database_schema.sql) for the complete, executable database schema.

## Key Features and Differences from Standard Setup

### Enhanced Features in Production Database:
1. **Multi-user Support**: `user_id` columns in `lists` and `events` tables
2. **Rich Recipe Metadata**: Additional fields like `pinned_comment`, `external_link`, `playlist_id`
3. **Playlist Organization**: Support for YouTube playlist tracking
4. **Enhanced Analytics**: User-specific event tracking

### Schema Inconsistencies to be Aware Of:
1. **Timestamp Naming**: `events` table uses `"timestamp"` while others use `created_at`
2. **Duplicate Constraints**: `recipes` table has both `recipes_video_url_key` AND `recipes_video_url_unique`
3. **Missing Indexes**: No performance indexes are currently applied (see recommendations below)

### Current Foreign Key Relationships:
- `lists.recipe_id` → `recipes.id` (CASCADE DELETE)
- `events.recipe_id` → `recipes.id` (SET NULL on DELETE)

## Required Database Tables

### 1. `recipes` Table

The main table storing YouTube recipe data with AI-enriched ingredients.

```sql
CREATE TABLE recipes (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  channel TEXT NOT NULL,
  summary TEXT,
  ingredients JSONB, -- Array of ingredient strings
  pinned_comment TEXT,
  transcript TEXT,
  external_link TEXT,
  playlist_id TEXT
);

-- Add unique constraint on video_url
ALTER TABLE recipes ADD CONSTRAINT recipes_video_url_key UNIQUE (video_url);

-- Add indexes for performance
CREATE INDEX idx_recipes_ingredients_null ON recipes(ingredients) WHERE ingredients IS NULL;
CREATE INDEX idx_recipes_transcript_null ON recipes(transcript) WHERE transcript IS NULL;
CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX idx_recipes_playlist_id ON recipes(playlist_id) WHERE playlist_id IS NOT NULL;
```

**Column Details:**
- `id`: Auto-generated UUID primary key
- `created_at`: Automatic timestamp for creation time
- `title`: Recipe/video title from YouTube (required)
- `video_url`: Full YouTube video URL (required, unique constraint prevents duplicates)
- `channel`: YouTube channel name (required)
- `summary`: Video description from YouTube
- `ingredients`: JSONB array of ingredient strings (e.g. `["1 cup flour", "2 eggs"]`)
- `pinned_comment`: Pinned comment from YouTube video
- `transcript`: Video transcript text (populated by transcript-fill function)
- `external_link`: Additional external link related to recipe
- `playlist_id`: YouTube playlist ID for organization

### 2. `lists` Table

Stores grocery list items generated from selected recipes.

```sql
CREATE TABLE lists (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredients JSONB,
  user_id UUID
);

-- Add indexes
CREATE INDEX idx_lists_recipe_id ON lists(recipe_id);
CREATE INDEX idx_lists_created_at ON lists(created_at DESC);
CREATE INDEX idx_lists_user_id ON lists(user_id) WHERE user_id IS NOT NULL;

-- Optional: Add unique constraint to prevent duplicate recipe entries per user
-- ALTER TABLE lists ADD CONSTRAINT unique_recipe_per_user UNIQUE(recipe_id, user_id);
-- OR for single-user system:
-- ALTER TABLE lists ADD CONSTRAINT unique_recipe_in_list UNIQUE(recipe_id);
```

**Column Details:**
- `id`: Auto-generated UUID primary key
- `created_at`: Automatic timestamp
- `recipe_id`: Foreign key reference to recipes table (required)
- `ingredients`: JSONB array containing the ingredients for the grocery list
- `user_id`: Optional user identifier for multi-user support

### 3. `events` Table

Tracks user actions for analytics and debugging.

```sql
CREATE TABLE events (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  "timestamp" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  action TEXT NOT NULL,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  user_id UUID
);

-- Add indexes
CREATE INDEX idx_events_action ON events(action);
CREATE INDEX idx_events_timestamp ON events("timestamp" DESC);
CREATE INDEX idx_events_recipe_id ON events(recipe_id) WHERE recipe_id IS NOT NULL;
CREATE INDEX idx_events_user_id ON events(user_id) WHERE user_id IS NOT NULL;
```

**Column Details:**
- `id`: Auto-generated UUID primary key
- `timestamp`: Automatic timestamp (note: uses "timestamp" not "created_at")
- `action`: Event type (e.g., 'add_to_grocery_list', 'reset')
- `recipe_id`: Optional reference to related recipe
- `user_id`: Optional user identifier for multi-user support

## Row Level Security (RLS) Setup

Since this is an MVP with public access, you can disable RLS or set permissive policies:

```sql
-- Option 1: Disable RLS for MVP (simpler but less secure)
ALTER TABLE recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;

-- Option 2: Enable RLS with permissive policies (recommended)
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow public read/write access (adjust as needed for your security requirements)
CREATE POLICY "Allow all operations on recipes" ON recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on lists" ON lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on events" ON events FOR ALL USING (true) WITH CHECK (true);
```

## Database Functions and Triggers

### Auto-update timestamps (optional but recommended)

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at column to recipes (if you want to track updates)
ALTER TABLE recipes ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Create trigger
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

## API Access Configuration

### Environment Variables Required

Your Supabase project needs these configuration values:

```env
# Get these from your Supabase project settings
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

### API Key Permissions

The anon key should have the following permissions:
- `SELECT` on all tables
- `INSERT` on `lists` and `events` tables
- `UPDATE` on `lists` table (for ingredient modifications)
- `DELETE` on `lists` table (for list reset functionality)

For the Netlify Functions, ensure they can:
- `INSERT` and `UPDATE` on `recipes` table (sync and enrich functions)
- `SELECT` on all tables

## Data Flow

### 1. Recipe Synchronization
1. `sync.js` function fetches YouTube playlist data
2. Inserts new recipes with basic metadata (`title`, `channel`, `video_url`, `summary`)
3. Sets `ingredients` and `transcript` to `null` initially

### 2. Recipe Enrichment
1. `enrich.js` function finds recipes where `ingredients IS NULL`
2. Fetches transcripts via external API
3. Uses Gemini (generativelanguage.googleapis.com) to extract ingredients via the callGeminiAPI function targeting the gemini-2.0-flash model
4. Updates `recipes.ingredients` with JSONB array

### 3. Transcript Population
1. `transcript-fill.js` function finds recipes where `transcript IS NULL`
2. Fetches transcripts via external API
3. Updates `recipes.transcript` with text content

### 4. Grocery List Management
1. Frontend adds recipes to `lists` table via `recipe_id`
2. Copies `ingredients` array from recipes
3. User can check/uncheck items (stored in localStorage)
4. Reset function clears all `lists` entries

## Sample Data

### Example Recipe Row
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "created_at": "2026-01-29T10:00:00Z",
  "title": "Perfect Chocolate Chip Cookies",
  "video_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "channel": "Baking Channel",
  "summary": "Learn how to make the perfect chocolate chip cookies...",
  "ingredients": [
    "2¼ cups all-purpose flour",
    "1 tsp baking soda",
    "1 tsp salt",
    "1 cup butter, softened",
    "¾ cup granulated sugar",
    "¾ cup brown sugar",
    "2 large eggs",
    "2 tsp vanilla extract",
    "2 cups chocolate chips"
  ],
  "pinned_comment": "Don't forget to chill the dough for 30 minutes!",
  "transcript": "Hey everyone, welcome back to my channel...",
  "external_link": "https://bakingchannel.com/cookie-tips",
  "playlist_id": "PL_CookieRecipes123"
}
```

### Example Lists Row
```json
{
  "id": "456e7890-e89b-12d3-a456-426614174001",
  "created_at": "2026-01-29T10:30:00Z",
  "recipe_id": "123e4567-e89b-12d3-a456-426614174000",
  "ingredients": [
    "2¼ cups all-purpose flour",
    "1 tsp baking soda",
    "1 tsp salt",
    "1 cup butter, softened"
  ],
  "user_id": "789e0123-e89b-12d3-a456-426614174002"
}
```

### Example Events Row
```json
{
  "id": "abc1234d-e89b-12d3-a456-426614174003",
  "timestamp": "2026-01-29T10:35:00Z",
  "action": "add_to_grocery_list",
  "recipe_id": "123e4567-e89b-12d3-a456-426614174000",
  "user_id": "789e0123-e89b-12d3-a456-426614174002"
}
```

## Database Migrations

If you're setting up a fresh Supabase project, use the complete schema file:

**📄 Run the complete schema:** Execute [`database_schema.sql`](./database_schema.sql) in your Supabase SQL editor to create all tables, constraints, indexes, and RLS policies.

Alternatively, you can run the schema sections individually if needed. The schema file includes:
- Table definitions for `recipes`, `lists`, and `events`
- Primary key constraints and foreign key relationships
- Unique constraints (including the video_url uniqueness)
- Performance indexes for common queries
- Row Level Security (RLS) policies
- Optional improvements and cleanup commands

## Performance and Maintenance Recommendations

### Immediate Performance Improvements
Your database currently lacks performance indexes. Add these for better query performance:

```sql
-- Performance indexes (missing from current setup)
CREATE INDEX idx_recipes_ingredients_null ON recipes(ingredients) WHERE ingredients IS NULL;
CREATE INDEX idx_recipes_transcript_null ON recipes(transcript) WHERE transcript IS NULL;
CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX idx_recipes_playlist_id ON recipes(playlist_id) WHERE playlist_id IS NOT NULL;

CREATE INDEX idx_lists_recipe_id ON lists(recipe_id);
CREATE INDEX idx_lists_created_at ON lists(created_at DESC);
CREATE INDEX idx_lists_user_id ON lists(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_events_action ON events(action);
CREATE INDEX idx_events_timestamp ON events("timestamp" DESC);
CREATE INDEX idx_events_recipe_id ON events(recipe_id) WHERE recipe_id IS NOT NULL;
CREATE INDEX idx_events_user_id ON events(user_id) WHERE user_id IS NOT NULL;
```

### Schema Cleanup (Optional)
```sql
-- Remove duplicate constraint (you have both recipes_video_url_key AND recipes_video_url_unique)
ALTER TABLE recipes DROP CONSTRAINT recipes_video_url_unique;

-- Add unique constraint for lists if you want to prevent duplicate recipes per user
ALTER TABLE lists ADD CONSTRAINT unique_recipe_per_user UNIQUE(recipe_id, user_id);
```

### Monitoring and Maintenance

### Useful Queries

```sql
-- Check sync status
SELECT 
  COUNT(*) as total_recipes,
  COUNT(ingredients) as enriched_recipes,
  COUNT(transcript) as transcripted_recipes
FROM recipes;

-- View recent activity
SELECT action, COUNT(*), MAX("timestamp") as last_occurrence
FROM events 
GROUP BY action
ORDER BY last_occurrence DESC;

-- Find recipes missing ingredients
SELECT id, title, video_url 
FROM recipes 
WHERE ingredients IS NULL 
LIMIT 10;

-- Current grocery list summary
SELECT r.title, r.channel, array_length(l.ingredients, 1) as ingredient_count
FROM lists l
JOIN recipes r ON l.recipe_id = r.id
ORDER BY l.created_at DESC;
```

### Performance Considerations

1. **Indexes**: All critical query paths are indexed
2. **JSONB**: Ingredients stored as JSONB for efficient querying and updates
3. **Constraints**: Foreign keys ensure data integrity
4. **Cleanup**: Consider adding a cleanup job for old events if needed

## Security Considerations

1. **API Keys**: Store Supabase keys securely in environment variables
2. **RLS**: Enable Row Level Security for production deployments
3. **Function Access**: Netlify Functions should use environment variables for DB access
4. **Rate Limiting**: Consider implementing rate limiting on API endpoints

## Next Steps

1. Create the Supabase project and run the migration SQL
2. Update your `.env` file with the correct Supabase URL and keys
3. Test the connectivity using the connectivity test function
4. Run the sync function to populate initial data
5. Test the full workflow: sync → enrich → add to grocery list

## Troubleshooting

### Common Issues

1. **Connection Errors**: Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. **Permission Errors**: Check RLS policies and anon key permissions
3. **Missing Data**: Ensure foreign key constraints and referential integrity
4. **Performance Issues**: Monitor query performance and add indexes as needed

### Debug Queries

```sql
-- Check table structure
\d recipes
\d lists  
\d events

-- Verify RLS policies
SELECT * FROM pg_policies WHERE tablename IN ('recipes', 'lists', 'events');

-- Check for constraint violations
SELECT conname, contype, confupdtype, confdeltype 
FROM pg_constraint 
WHERE conrelid IN ('recipes'::regclass, 'lists'::regclass, 'events'::regclass);
```