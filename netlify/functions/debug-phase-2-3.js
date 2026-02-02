import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers }
  }

  try {
    console.log('🔍 Phase 2.3 Database Debug - checking user_recipes table...')
    
    // Check if user_recipes table exists and is accessible
    const { data: userRecipes, error: userRecipesError } = await supabase
      .from('user_recipes')
      .select('*')
      .limit(1)

    const results = {
      timestamp: new Date().toISOString(),
      supabase_url: !!process.env.VITE_SUPABASE_URL,
      service_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      user_recipes_table: {
        accessible: !userRecipesError,
        error: userRecipesError?.message,
        error_code: userRecipesError?.code,
        error_details: userRecipesError?.details,
        sample_count: userRecipes?.length || 0
      }
    }

    // Also check user_playlists table
    const { data: playlists, error: playlistsError } = await supabase
      .from('user_playlists')
      .select('id, user_id, title, youtube_playlist_id')
      .limit(3)

    results.user_playlists_table = {
      accessible: !playlistsError,
      error: playlistsError?.message,
      count: playlists?.length || 0,
      sample_ids: playlists?.map(p => p.id) || []
    }

    // Check recipes table  
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('id, title, youtube_video_id')
      .limit(3)

    results.recipes_table = {
      accessible: !recipesError,
      error: recipesError?.message,
      count: recipes?.length || 0,
      has_youtube_video_id_column: recipes?.some(r => 'youtube_video_id' in r)
    }

    // Check playlist_sync_logs table
    const { data: logs, error: logsError } = await supabase
      .from('playlist_sync_logs')
      .select('id, status')
      .limit(2)

    results.playlist_sync_logs_table = {
      accessible: !logsError,
      error: logsError?.message,
      count: logs?.length || 0
    }

    console.log('Debug results:', JSON.stringify(results, null, 2))

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(results, null, 2)
    }

  } catch (error) {
    console.error('❌ Database debug failed:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Debug failed',
        message: error.message,
        stack: error.stack
      })
    }
  }
}