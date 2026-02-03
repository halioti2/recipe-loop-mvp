import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role to bypass RLS
);

async function simpleTest() {
  console.log('🔍 SIMPLE DATA ACCESS TEST\n');
  
  const userId = 'd0212698-e164-4602-9268-5eff2a1e01f7';
  console.log('Testing with user ID:', userId);
  console.log('Supabase URL:', process.env.VITE_SUPABASE_URL);
  console.log('Using anon key (first 20 chars):', process.env.VITE_SUPABASE_ANON_KEY.substring(0, 20) + '...\n');
  
  // Test 1: Check if we can access user_recipes table at all
  console.log('1. Testing basic access to user_recipes table:');
  const { data: allUserRecipes, error: allError } = await supabase
    .from('user_recipes')
    .select('id, user_id')
    .limit(5);
    
  if (allError) {
    console.error('❌ Cannot access user_recipes table:', allError);
    return;
  }
  
  console.log(`✅ Can access user_recipes table. Found ${allUserRecipes.length} records`);
  if (allUserRecipes.length > 0) {
    console.log('Sample records:');
    allUserRecipes.forEach(ur => console.log(`  ${ur.id} → user: ${ur.user_id}`));
  }
  
  // Test 2: Try to query for our specific user
  console.log('\n2. Testing query for specific user:');
  const { data: specificUserRecipes, error: specificError } = await supabase
    .from('user_recipes')
    .select('id, user_id, recipe_id')
    .eq('user_id', userId);
    
  if (specificError) {
    console.error('❌ Error querying for specific user:', specificError);
    return;
  }
  
  console.log(`Found ${specificUserRecipes.length} records for user ${userId}`);
  if (specificUserRecipes.length > 0) {
    console.log('First 3 records:');
    specificUserRecipes.slice(0, 3).forEach(ur => {
      console.log(`  ${ur.id} → recipe: ${ur.recipe_id}`);
    });
  }
  
  // Test 3: Try recipes table
  console.log('\n3. Testing access to recipes table:');
  const { data: recipes, error: recipesError } = await supabase
    .from('recipes')
    .select('id, title')
    .limit(3);
    
  if (recipesError) {
    console.error('❌ Cannot access recipes table:', recipesError);
    return;
  }
  
  console.log(`✅ Can access recipes table. Found ${recipes.length} records`);
  recipes.forEach(r => console.log(`  ${r.id}: ${r.title?.substring(0, 50)}...`));
  
  // Test 4: Test the join without user filter first
  console.log('\n4. Testing join without user filter:');
  const { data: joinTest, error: joinError } = await supabase
    .from('user_recipes')
    .select('id, recipes(id, title)')
    .limit(3);
    
  if (joinError) {
    console.error('❌ Join query failed:', joinError);
    return;
  }
  
  console.log(`Join test returned ${joinTest.length} records`);
  joinTest.forEach((item, idx) => {
    console.log(`  ${idx}: user_recipe ${item.id} → recipes: ${item.recipes ? 'EXISTS' : 'NULL'}`);
    if (item.recipes) {
      console.log(`    Recipe: ${item.recipes.title?.substring(0, 40)}...`);
    }
  });
}

simpleTest().catch(console.error);