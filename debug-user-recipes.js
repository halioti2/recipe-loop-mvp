// Debug user_recipes table
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function debugUserRecipes() {
  console.log('🔍 Phase 2.3 Database Debug')
  console.log('URL:', process.env.VITE_SUPABASE_URL ? 'Loaded' : '❌ Missing')
  console.log('Key:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Loaded' : '❌ Missing')
  
  try {
    // 1. Check user_recipes table structure
    console.log('\n1️⃣ Checking user_recipes table...')
    const { data: userRecipes, error: userRecipesError } = await supabase
      .from('user_recipes')
      .select('*')
      .limit(1)
    
    if (userRecipesError) {
      console.error('❌ user_recipes table error:', userRecipesError)
    } else {
      console.log('✅ user_recipes table exists')
      console.log('Columns available:', Object.keys(userRecipes[0] || {}))
    }

    // 2. Check user_playlists table
    console.log('\n2️⃣ Checking user_playlists table...')
    const { data: playlists, error: playlistError } = await supabase
      .from('user_playlists')
      .select('id, user_id, youtube_playlist_id, title')
      .limit(3)
    
    if (playlistError) {
      console.error('❌ user_playlists error:', playlistError)
    } else {
      console.log('✅ Found', playlists.length, 'playlists')
      if (playlists.length > 0) {
        console.log('Sample playlist:', playlists[0])
      }
    }

    // 3. Test user_recipes insertion with real data (if playlists exist)
    if (playlists && playlists.length > 0) {
      console.log('\n3️⃣ Testing user_recipes insertion...')
      
      // First, create a test recipe if needed
      const testRecipe = {
        title: 'Test Recipe for Phase 2.3',
        video_url: 'https://www.youtube.com/watch?v=test123',
        channel: 'Test Channel',
        youtube_video_id: 'test123',
        sync_status: 'synced'
      }
      
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .upsert([testRecipe])
        .select('id')
        .single()
      
      if (recipeError) {
        console.error('❌ Error creating test recipe:', recipeError)
        return
      }
      
      console.log('✅ Test recipe created:', recipe.id)
      
      // Now test user_recipes insertion
      const testUserRecipe = {
        user_id: playlists[0].user_id,
        recipe_id: recipe.id,
        playlist_id: playlists[0].id,
        position_in_playlist: 1,
        added_at: new Date().toISOString()
      }
      
      console.log('Attempting to insert:', testUserRecipe)
      
      const { data: userRecipe, error: userRecipeError } = await supabase
        .from('user_recipes')
        .insert([testUserRecipe])
        .select()
        .single()
      
      if (userRecipeError) {
        console.error('❌ user_recipes insertion failed:', userRecipeError)
        console.error('Error details:', userRecipeError.details)
        console.error('Error hint:', userRecipeError.hint)
      } else {
        console.log('✅ user_recipes insertion successful:', userRecipe)
        
        // Clean up
        await supabase.from('user_recipes').delete().eq('id', userRecipe.id)
        await supabase.from('recipes').delete().eq('id', recipe.id)
        console.log('🧹 Cleaned up test data')
      }
    }

  } catch (error) {
    console.error('❌ Debug failed:', error)
  }
}

debugUserRecipes()