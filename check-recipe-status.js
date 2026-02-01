import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Check all recipes and their enrichment status
const { data: recipes, error } = await supabase
  .from('recipes')
  .select('id, title, ingredients, transcript')
  .order('created_at', { ascending: false });

if (error) {
  console.error('❌ Failed to fetch recipes:', error.message);
  process.exit(1);
}

if (!recipes) {
  console.log('ℹ️  No recipes found');
  process.exit(0);
}

console.log('=== ALL RECIPES STATUS ===');
recipes.forEach(recipe => {
  const hasIngredients = recipe.ingredients ? '✅' : '❌';
  const hasTranscript = recipe.transcript ? '📝' : '❌';
  console.log(`${hasIngredients} ${hasTranscript} ${recipe.title}`);
  if (recipe.ingredients) {
    console.log(`    Ingredients: ${recipe.ingredients.length} items`);
  }
});

console.log(`\nTotal recipes: ${recipes?.length || 0}`);
console.log(`With ingredients: ${recipes?.filter(r => r.ingredients).length || 0}`);
console.log(`With transcripts: ${recipes?.filter(r => r.transcript).length || 0}`);
console.log(`Need enrichment: ${recipes?.filter(r => !r.ingredients && r.transcript).length || 0}`);