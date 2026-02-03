import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function comprehensiveDebug() {
  console.log('🔍 COMPREHENSIVE DATABASE DEBUG\n');
  
  // Get the current user ID from the logs
  const userId = 'd0212698-e164-4602-9268-5eff2a1e01f7';
  
  console.log('1. Checking user_recipes table for this user:');
  const { data: userRecipes, error: urError } = await supabase
    .from('user_recipes')
    .select('id, recipe_id, user_id, added_at')
    .eq('user_id', userId)
    .order('added_at', { ascending: false })
    .limit(10);
    
  if (urError) {
    console.error('❌ Error querying user_recipes:', urError);
    return;
  }
  
  console.log(`Found ${userRecipes.length} user_recipes for user ${userId}`);
  console.log('First 5 user_recipes:');
  userRecipes.slice(0, 5).forEach((ur, idx) => {
    console.log(`  ${idx}: user_recipe_id=${ur.id}, recipe_id=${ur.recipe_id}`);
  });
  
  console.log('\n2. Checking if these recipe_ids exist in recipes table:');
  const recipeIds = userRecipes.slice(0, 5).map(ur => ur.recipe_id);
  const { data: recipes, error: recipesError } = await supabase
    .from('recipes')
    .select('id, title, ingredients')
    .in('id', recipeIds);
    
  if (recipesError) {
    console.error('❌ Error querying recipes:', recipesError);
    return;
  }
  
  console.log(`Found ${recipes.length} matching recipes in recipes table:`);
  recipes.forEach(r => {
    console.log(`  ID: ${r.id}`);
    console.log(`  Title: ${r.title?.substring(0, 60)}...`);
    console.log(`  Has ingredients: ${Array.isArray(r.ingredients) && r.ingredients.length > 0}`);
    console.log('');
  });
  
  console.log('\n3. Cross-checking which user_recipes have matching recipes:');
  userRecipes.slice(0, 5).forEach(ur => {
    const matchingRecipe = recipes.find(r => r.id === ur.recipe_id);
    console.log(`  user_recipe ${ur.id} → recipe_id ${ur.recipe_id}: ${matchingRecipe ? '✅ FOUND' : '❌ MISSING'}`);
    if (matchingRecipe) {
      console.log(`    Title: ${matchingRecipe.title?.substring(0, 50)}...`);
    }
  });
  
  console.log('\n4. Testing the exact join query from HomePageTest:');
  const { data: joinedData, error: joinError } = await supabase
    .from('user_recipes')
    .select(`
      id,
      added_at,
      is_favorite,
      personal_notes,
      playlist_id,
      position_in_playlist,
      recipes (
        id,
        title,
        video_url,
        channel,
        summary,
        ingredients,
        youtube_video_id,
        sync_status,
        created_at
      ),
      user_playlists (
        id,
        title,
        youtube_playlist_id
      )
    `)
    .eq('user_id', userId)
    .order('added_at', { ascending: false })
    .limit(5);
    
  if (joinError) {
    console.error('❌ Error in join query:', joinError);
    return;
  }
  
  console.log(`Join query returned ${joinedData.length} records:`);
  joinedData.forEach((item, idx) => {
    console.log(`  ${idx}: user_recipe_id=${item.id}`);
    console.log(`    recipes field: ${item.recipes ? 'EXISTS' : 'NULL'}`);
    if (item.recipes) {
      console.log(`    recipe.id: ${item.recipes.id}`);
      console.log(`    recipe.title: ${item.recipes.title?.substring(0, 50)}...`);
      console.log(`    Has ingredients: ${Array.isArray(item.recipes.ingredients) && item.recipes.ingredients.length > 0}`);
    }
    console.log('');
  });
  
  console.log('\n5. Checking foreign key constraint:');
  // Check if there's a foreign key constraint
  const { data: constraints, error: constraintError } = await supabase
    .rpc('get_foreign_keys', { table_name: 'user_recipes' })
    .single();
    
  if (constraintError) {
    console.log('Could not check constraints (this is normal)');
  } else {
    console.log('Foreign key constraints:', constraints);
  }
  
  console.log('\n🎯 SUMMARY:');
  console.log(`- User recipes found: ${userRecipes.length}`);
  console.log(`- Matching recipes in recipes table: ${recipes.length}`);
  console.log(`- Successful joins: ${joinedData.filter(j => j.recipes).length}`);
  console.log(`- Failed joins: ${joinedData.filter(j => !j.recipes).length}`);
}

comprehensiveDebug().catch(console.error);