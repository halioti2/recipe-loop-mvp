import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugActiveField() {
  console.log('🔍 DEBUGGING ACTIVE FIELD ISSUE\n');
  
  const userId = 'd0212698-e164-4602-9268-5eff2a1e01f7';
  
  console.log('1. Checking user_playlists table structure...');
  const { data: playlists, error: playlistError } = await supabase
    .from('user_playlists')
    .select('id, title, youtube_playlist_id, active, sync_enabled')
    .eq('user_id', userId);
    
  if (playlistError) {
    console.error('❌ Error querying user_playlists:', playlistError);
    console.log('\nThe "active" column might not exist yet. Run this SQL:');
    console.log('ALTER TABLE user_playlists ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE NOT NULL;');
    return;
  }
  
  console.log(`Found ${playlists.length} user_playlists:`);
  playlists.forEach(p => {
    console.log(`  ${p.title}: active=${p.active}, sync_enabled=${p.sync_enabled}`);
  });
  
  const activePlaylists = playlists.filter(p => p.active);
  console.log(`\nActive playlists: ${activePlaylists.length}`);
  
  if (activePlaylists.length === 0) {
    console.log('\n⚠️  NO ACTIVE PLAYLISTS FOUND!');
    console.log('This explains why no recipes are showing.');
    console.log('\nFix: Run this SQL to activate all playlists:');
    console.log('UPDATE user_playlists SET active = TRUE WHERE user_id = \'' + userId + '\';');
    return;
  }
  
  console.log('\n2. Testing HomePageTest query with active filter...');
  const { data: userRecipes, error: recipesError } = await supabase
    .from('user_recipes')
    .select(`
      id,
      added_at,
      user_playlists!inner (
        id,
        title,
        youtube_playlist_id,
        active
      )
    `)
    .eq('user_id', userId)
    .eq('user_playlists.active', true)
    .limit(5);
    
  if (recipesError) {
    console.error('❌ Error with active filter query:', recipesError);
  } else {
    console.log(`Found ${userRecipes.length} user_recipes from active playlists`);
    userRecipes.forEach(ur => {
      console.log(`  Recipe ${ur.id} from playlist: ${ur.user_playlists.title}`);
    });
  }
  
  console.log('\n3. Testing query WITHOUT active filter...');
  const { data: allUserRecipes, error: allError } = await supabase
    .from('user_recipes')
    .select(`
      id,
      added_at,
      user_playlists (
        id,
        title,
        active
      )
    `)
    .eq('user_id', userId)
    .limit(5);
    
  if (allError) {
    console.error('❌ Error with query without filter:', allError);
  } else {
    console.log(`Found ${allUserRecipes.length} total user_recipes`);
    allUserRecipes.forEach(ur => {
      if (ur.user_playlists) {
        console.log(`  Recipe ${ur.id}: playlist active=${ur.user_playlists.active}`);
      } else {
        console.log(`  Recipe ${ur.id}: no playlist data`);
      }
    });
  }
  
  console.log('\n🎯 SUMMARY:');
  console.log(`- Total playlists: ${playlists.length}`);
  console.log(`- Active playlists: ${activePlaylists.length}`);
  console.log(`- Recipes with active filter: ${userRecipes?.length || 0}`);
  console.log(`- Total recipes: ${allUserRecipes?.length || 0}`);
}

debugActiveField().catch(console.error);