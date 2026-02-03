import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function debugUserRecipesJoin() {
  console.log('🔍 Debugging user_recipes join issue...\n');
  
  // First check user_recipes table directly
  console.log('1. Checking user_recipes table structure:');
  const { data: userRecipes, error: userRecipesError } = await supabase
    .from('user_recipes')
    .select('id, recipe_id, user_id')
    .limit(5);
    
  if (userRecipesError) {
    console.error('❌ Error querying user_recipes:', userRecipesError);
    return;
  }
  
  console.log('Sample user_recipes records:');
  userRecipes.forEach(ur => {
    console.log(`  ID: ${ur.id}, recipe_id: ${ur.recipe_id}, user_id: ${ur.user_id}`);
  });
  
  // Check recipes table
  console.log('\n2. Checking recipes table:');
  const { data: recipes, error: recipesError } = await supabase
    .from('recipes')
    .select('id, title')
    .limit(5);
    
  if (recipesError) {
    console.error('❌ Error querying recipes:', recipesError);
    return;
  }
  
  console.log('Sample recipes records:');
  recipes.forEach(r => {
    console.log(`  ID: ${r.id}, title: ${r.title?.substring(0, 50)}...`);
  });
  
  // Now test the join
  console.log('\n3. Testing the join:');
  const { data: joinedData, error: joinError } = await supabase
    .from('user_recipes')
    .select(`
      id,
      recipe_id,
      recipes (
        id,
        title,
        ingredients
      )
    `)
    .limit(5);
    
  if (joinError) {
    console.error('❌ Error in join query:', joinError);
    return;
  }
  
  console.log('Join results:');
  joinedData.forEach((item, idx) => {
    console.log(`  ${idx}: recipe_id=${item.recipe_id}, hasRecipes=${!!item.recipes}`);
    if (item.recipes) {
      console.log(`    Recipe: ${item.recipes.title?.substring(0, 50)}...`);
      console.log(`    Has ingredients: ${Array.isArray(item.recipes.ingredients) && item.recipes.ingredients.length > 0}`);
    } else {
      console.log(`    ❌ No recipe data found for recipe_id: ${item.recipe_id}`);
    }
  });
  
  // Check if recipe_id exists in recipes table
  console.log('\n4. Checking if recipe_ids exist in recipes table:');
  const firstRecipeId = userRecipes[0]?.recipe_id;
  if (firstRecipeId) {
    const { data: recipeCheck, error: checkError } = await supabase
      .from('recipes')
      .select('id, title')
      .eq('id', firstRecipeId);
      
    if (checkError) {
      console.error('❌ Error checking recipe existence:', checkError);
    } else {
      console.log(`Recipe ${firstRecipeId} exists: ${recipeCheck.length > 0}`);
      if (recipeCheck.length > 0) {
        console.log(`  Title: ${recipeCheck[0].title}`);
      }
    }
  }
}

debugUserRecipesJoin().catch(console.error);