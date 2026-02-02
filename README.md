# Recipe Loop MVP

A React application that syncs YouTube recipe videos, extracts ingredients using AI, and generates grocery lists.

## Tech Stack

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Netlify Functions
- **Database**: Supabase (PostgreSQL)
- **APIs**: YouTube Data API, Gemini AI API

## Database Setup

**📄 Database Schema:** See [`database_schema.sql`](./database_schema.sql) for the complete, executable database schema.

This file contains:
- Complete table definitions (recipes, lists, events)
- Indexes for performance optimization
- Row Level Security (RLS) policies
- Foreign key relationships
- Sample data examples

## Environment Variables

Create a `.env` file with:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
YOUTUBE_API_KEY=your_youtube_api_key
GEMINI_API_KEY=your_gemini_api_key
YOUTUBE_PLAYLIST_ID=your_playlist_id
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start Netlify Functions locally
netlify dev
```

## Testing

```bash
# Run database tests
NODE_ENV=development node -r dotenv/config test-frontend-db.js
NODE_ENV=development node -r dotenv/config test-db-workflow.js

# Run function tests (requires netlify dev running)
NODE_ENV=development node -r dotenv/config test-netlify-workflow.js
```

## Core Features

### 1. Recipe Synchronization
- Fetches YouTube playlist videos
- Stores metadata (title, channel, summary)
- Prevents duplicate entries

### 2. AI Ingredient Extraction
- Uses Gemini API to extract ingredients from video transcripts
- Stores as JSONB arrays for easy querying

### 3. Grocery List Generation
- Users can add recipes to grocery lists
- Combines ingredients from multiple recipes
- Tracks user actions and events

## API Endpoints

### Netlify Functions
- `/api/sync` - Sync YouTube playlist data
- `/api/enrich` - Extract ingredients using AI
- `/api/transcript-fill` - Populate video transcripts

## Multi-User Support

The database schema includes `user_id` columns for multi-user capability. See [`AUTHENTICATION_PLAN.md`](./AUTHENTICATION_PLAN.md) for implementation details.

## Database Structure

### Tables
- **recipes**: YouTube recipe data + AI-extracted ingredients
- **lists**: User grocery lists with recipe associations  
- **events**: User action tracking and analytics

### Key Features
- JSONB ingredient storage for flexible querying
- Foreign key relationships for data integrity
- RLS policies for user data isolation (when auth is implemented)
- Performance indexes on common query paths
