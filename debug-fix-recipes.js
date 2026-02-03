import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Use service role to see actual data
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixMissingRecipes() {
  console.log('🔧 FIXING MISSING RECIPES ISSUE\n');
  
  const userId = 'd0212698-e164-4602-9268-5eff2a1e01f7';
  
  // 1. Get all user_recipes for this user
  console.log('1. Getting all user_recipes...');
  const { data: userRecipes, error: urError } = await supabase
    .from('user_recipes')
    .select('id, recipe_id')
    .eq('user_id', userId);
    
  if (urError) {
    console.error('Error:', urError);
    return;
  }
  
  console.log(`Found ${userRecipes.length} user_recipes`);
  
  // 2. Check which recipe_ids exist in recipes table
  const recipeIds = userRecipes.map(ur => ur.recipe_id);
  console.log('\n2. Checking which recipe_ids exist in recipes table...');
  
  const { data: existingRecipes, error: recipeError } = await supabase
    .from('recipes')
    .select('id, title')
    .in('id', recipeIds);
    
  if (recipeError) {
    console.error('Error:', recipeError);
    return;
  }
  
  console.log(`Found ${existingRecipes.length} existing recipes out of ${recipeIds.length} user_recipes`);
  
  // 3. Identify missing recipes
  const existingRecipeIds = new Set(existingRecipes.map(r => r.id));
  const missingRecipeIds = recipeIds.filter(id => !existingRecipeIds.has(id));
  
  console.log(`\n3. Missing recipes: ${missingRecipeIds.length}`);
  if (missingRecipeIds.length > 0) {
    console.log('Missing recipe IDs:');
    missingRecipeIds.slice(0, 5).forEach(id => console.log(`  ${id}`));
  }
  
  // 4. Show successful matches
  console.log(`\n4. Successful matches: ${existingRecipes.length}`);
  existingRecipes.slice(0, 5).forEach(r => {
    console.log(`  ${r.id}: ${r.title?.substring(0, 50)}...`);
  });
  
  // 5. Test RLS on recipes table with anon key
  console.log('\n5. Testing RLS on recipes table...');
  const anonSupabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );
  
  const { data: anonRecipes, error: anonError } = await anonSupabase
    .from('recipes')
    .select('id, title')
    .limit(5);
    
  if (anonError) {
    console.error('❌ RLS blocks anon access to recipes:', anonError);
  } else {
    console.log(`✅ Anon key can access ${anonRecipes.length} recipes`);
  }
  
  // 6. Recommend fixes
  console.log('\n🎯 RECOMMENDATIONS:');
  
  if (missingRecipeIds.length > 0) {
    console.log(`1. ${missingRecipeIds.length} user_recipes point to non-existent recipes`);
    console.log('   → Run playlist sync to create missing recipe records');
    console.log('   → Or clean up orphaned user_recipes records');
  }
  
  if (anonError) {
    console.log('2. RLS blocks anon access to recipes table');
    console.log('   → Check RLS policies on recipes table');
    console.log('   → Ensure authenticated users can read recipes');
  }
  
  if (existingRecipes.length > 0) {
    console.log(`3. ${existingRecipes.length} recipes should work - check join query`);
  }
}

fixMissingRecipes().catch(console.error);