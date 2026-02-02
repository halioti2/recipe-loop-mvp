import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('🔍 Checking current database structure...\n');
  
  // Check if user_playlists table exists
  const { data: playlists, error: playlistsError } = await supabase
    .from('user_playlists')
    .select('*')
    .limit(1);
  
  if (playlistsError) {
    console.log('❌ user_playlists table:', playlistsError.message);
  } else {
    console.log('✅ user_playlists table exists');
  }
  
  // Check if playlist_sync_logs table exists  
  const { data: logs, error: logsError } = await supabase
    .from('playlist_sync_logs')
    .select('*')
    .limit(1);
    
  if (logsError) {
    console.log('❌ playlist_sync_logs table:', logsError.message);
  } else {
    console.log('✅ playlist_sync_logs table exists');
  }
  
  // Check if new columns exist on recipes table
  const { data: recipes, error: recipesError } = await supabase
    .from('recipes')
    .select('source_playlist_id, youtube_video_id, playlist_video_position')
    .limit(1);
    
  if (recipesError) {
    console.log('❌ New recipe columns:', recipesError.message);
  } else {
    console.log('✅ New recipe columns exist');
    if (recipes && recipes.length > 0) {
      const columns = Object.keys(recipes[0]);
      console.log('   Recipe columns:', columns);
    }
  }
  
  // Try a basic recipes query to see current structure
  const { data: allRecipes, error: allRecipesError } = await supabase
    .from('recipes')
    .select('*')
    .limit(1);
    
  if (allRecipesError) {
    console.log('❌ Could not query recipes:', allRecipesError.message);
  } else if (allRecipes && allRecipes.length > 0) {
    console.log('📋 Current recipes table columns:', Object.keys(allRecipes[0]));
  } else {
    console.log('📋 Recipes table exists but is empty');
  }
  
  process.exit(0);
})();