-- Recipe Loop MVP Database Schema
-- Based on production database backup: db_cluster-06-07-2025@13-25-52.backup
-- Generated: January 29, 2026

-- =============================================================================
-- TABLE DEFINITIONS
-- =============================================================================

-- 1. RECIPES TABLE
-- Main table storing YouTube recipe data with AI-enriched ingredients
CREATE TABLE recipes (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  channel TEXT NOT NULL,
  summary TEXT,
  ingredients JSONB,
  pinned_comment TEXT,
  transcript TEXT,
  external_link TEXT,
  playlist_id TEXT
);

-- 2. LISTS TABLE  
-- Stores grocery list items generated from selected recipes
CREATE TABLE lists (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredients JSONB,
  user_id UUID
);

-- 3. EVENTS TABLE
-- Tracks user actions for analytics and debugging
CREATE TABLE events (
  id UUID DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
  "timestamp" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  action TEXT NOT NULL,
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  user_id UUID
);

-- =============================================================================
-- CONSTRAINTS
-- =============================================================================

-- Unique constraints
ALTER TABLE recipes ADD CONSTRAINT recipes_video_url_key UNIQUE (video_url);

-- Foreign key constraints are already defined in table creation above

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Recipes table indexes
CREATE INDEX idx_recipes_ingredients_null ON recipes(ingredients) WHERE ingredients IS NULL;
CREATE INDEX idx_recipes_transcript_null ON recipes(transcript) WHERE transcript IS NULL;
CREATE INDEX idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX idx_recipes_playlist_id ON recipes(playlist_id) WHERE playlist_id IS NOT NULL;

-- Lists table indexes
CREATE INDEX idx_lists_recipe_id ON lists(recipe_id);
CREATE INDEX idx_lists_created_at ON lists(created_at DESC);
CREATE INDEX idx_lists_user_id ON lists(user_id) WHERE user_id IS NOT NULL;

-- Events table indexes
CREATE INDEX idx_events_action ON events(action);
CREATE INDEX idx_events_timestamp ON events("timestamp" DESC);
CREATE INDEX idx_events_recipe_id ON events(recipe_id) WHERE recipe_id IS NOT NULL;
CREATE INDEX idx_events_user_id ON events(user_id) WHERE user_id IS NOT NULL;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) SETUP
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for MVP (adjust for production security needs)
CREATE POLICY "Allow all operations on recipes" ON recipes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on lists" ON lists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on events" ON events FOR ALL USING (true) WITH CHECK (true);

-- =============================================================================
-- OPTIONAL IMPROVEMENTS
-- =============================================================================

-- Optional: Prevent duplicate recipes per user in lists
-- ALTER TABLE lists ADD CONSTRAINT unique_recipe_per_user UNIQUE(recipe_id, user_id);

-- Optional: For single-user system, prevent duplicate recipes entirely
-- ALTER TABLE lists ADD CONSTRAINT unique_recipe_in_list UNIQUE(recipe_id);

-- Optional: Remove duplicate constraint if it exists
-- ALTER TABLE recipes DROP CONSTRAINT IF EXISTS recipes_video_url_unique;

-- =============================================================================
-- NOTES
-- =============================================================================

/*
Column Details:

RECIPES:
- id: Auto-generated UUID primary key
- created_at: Automatic timestamp for creation time
- title: Recipe/video title from YouTube (required)
- video_url: Full YouTube video URL (required, unique constraint prevents duplicates)
- channel: YouTube channel name (required)
- summary: Video description from YouTube
- ingredients: JSONB array of ingredient strings (e.g. ["1 cup flour", "2 eggs"])
- pinned_comment: Pinned comment from YouTube video
- transcript: Video transcript text (populated by transcript-fill function)
- external_link: Additional external link related to recipe
- playlist_id: YouTube playlist ID for organization

LISTS:
- id: Auto-generated UUID primary key
- created_at: Automatic timestamp
- recipe_id: Foreign key reference to recipes table (required)
- ingredients: JSONB array containing the ingredients for the grocery list
- user_id: Optional user identifier for multi-user support

EVENTS:
- id: Auto-generated UUID primary key
- timestamp: Automatic timestamp (note: uses "timestamp" not "created_at")
- action: Event type (e.g., 'add_to_grocery_list', 'reset')
- recipe_id: Optional reference to related recipe
- user_id: Optional user identifier for multi-user support

Schema Characteristics:
- Multi-user support via user_id columns
- Rich recipe metadata with YouTube-specific fields
- Playlist organization capability
- Analytics and event tracking
- JSONB for flexible ingredient storage
- Foreign keys ensure data integrity
*/