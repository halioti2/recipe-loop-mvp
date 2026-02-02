import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers }
  }

  try {
    const { user_playlist_id, mock_id } = JSON.parse(event.body)
    
    console.log('🧪 Testing Phase 2.3 user_recipes insertion with mock data...')
    
    // Get the playlist details
    const { data: playlist, error: playlistError } = await supabase
      .from('user_playlists')
      .select('*')
      .eq('id', user_playlist_id)
      .single()

    if (playlistError || !playlist) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Playlist not found', details: playlistError })
      }
    }

    console.log('Found playlist:', playlist.title)

    // Create a mock recipe with dynamic ID
    const uniqueId = mock_id || `test_${Date.now()}_${Math.random().toString(36).substring(2)}`
    const mockRecipe = {
      youtube_video_id: uniqueId,
      title: `Mock Recipe for Phase 2.3 Testing - ${uniqueId}`, 
      video_url: `https://www.youtube.com/watch?v=${uniqueId}`,
      channel: 'Test Channel',
      sync_status: 'synced'
    }

    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .upsert([mockRecipe])
      .select('id')
      .single()

    if (recipeError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to create mock recipe', details: recipeError })
      }
    }

    console.log('Created mock recipe:', recipe.id)

    // Now test user_recipes insertion (Phase 2.3 logic)
    const userRecipe = {
      user_id: playlist.user_id,
      recipe_id: recipe.id,
      playlist_id: user_playlist_id,
      position_in_playlist: 1,
      added_at: new Date().toISOString()
    }

    console.log('Attempting user_recipes insertion:', userRecipe)

    const { data: userRecipeResult, error: userRecipeError } = await supabase
      .from('user_recipes')
      .insert([userRecipe])
      .select()
      .single()

    if (userRecipeError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'user_recipes insertion failed',
          details: userRecipeError,
          attempted_insert: userRecipe
        })
      }
    }

    console.log('✅ user_recipes insertion successful!', userRecipeResult)

    // Check the result
    const { data: verification, error: verifyError } = await supabase
      .from('user_recipes')
      .select('*')
      .eq('user_id', playlist.user_id)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Phase 2.3 user_recipes insertion test passed!',
        playlist: playlist.title,
        recipe_id: recipe.id,
        user_recipe_id: userRecipeResult.id,
        total_user_recipes: verification?.length || 0,
        verification_data: verification
      })
    }

  } catch (error) {
    console.error('❌ Phase 2.3 test failed:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Test failed',
        message: error.message,
        stack: error.stack
      })
    }
  }
}