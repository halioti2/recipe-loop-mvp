import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixPlaylistLinking() {
  console.log('🔧 FIXING PLAYLIST LINKING IN USER_RECIPES\n');
  
  const userId = 'd0212698-e164-4602-9268-5eff2a1e01f7';
  
  console.log('1. Checking current state...');
  
  // Get user playlists
  const { data: playlists, error: playlistError } = await supabase
    .from('user_playlists')
    .select('id, title, youtube_playlist_id')
    .eq('user_id', userId);
    
  if (playlistError) {
    console.error('Error getting playlists:', playlistError);
    return;
  }
  
  console.log(`Found ${playlists.length} user playlists:`);
  playlists.forEach(p => console.log(`  ${p.title} (${p.youtube_playlist_id})`));
  
  // Get user recipes without playlist_id
  const { data: unlinkedRecipes, error: recipesError } = await supabase
    .from('user_recipes')
    .select('id, recipe_id')
    .eq('user_id', userId)
    .is('playlist_id', null);
    
  if (recipesError) {
    console.error('Error getting recipes:', recipesError);
    return;
  }
  
  console.log(`\nFound ${unlinkedRecipes.length} user_recipes without playlist_id`);
  
  if (unlinkedRecipes.length > 0 && playlists.length > 0) {
    // Assign all unlinked recipes to the first active playlist
    const firstPlaylist = playlists[0];
    console.log(`\n2. Linking all recipes to playlist: ${firstPlaylist.title}`);
    
    const { error: updateError } = await supabase
      .from('user_recipes')
      .update({ playlist_id: firstPlaylist.id })
      .eq('user_id', userId)
      .is('playlist_id', null);
      
    if (updateError) {
      console.error('❌ Error updating recipes:', updateError);
    } else {
      console.log('✅ Successfully linked all recipes to playlist');
    }
  }
  
  console.log('\n3. Testing the corrected query...');
  const { data: linkedRecipes, error: testError } = await supabase
    .from('user_recipes')
    .select(`
      id,
      user_playlists!inner (
        id,
        title,
        active
      )
    `)
    .eq('user_id', userId)
    .eq('user_playlists.active', true);
    
  if (testError) {
    console.error('❌ Test query failed:', testError);
  } else {
    console.log(`✅ Found ${linkedRecipes.length} recipes from active playlists`);
  }
  
  console.log('\n🎯 RECOMMENDATION:');
  console.log('Update your playlist sync logic to set playlist_id when adding recipes');
  console.log('This ensures new recipes are properly linked to their source playlists');
}

fixPlaylistLinking().catch(console.error);