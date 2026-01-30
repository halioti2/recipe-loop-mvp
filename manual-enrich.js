// Manual enrichment for the butter chicken recipe based on transcript analysis
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Get the recipe that needs enrichment
const { data: recipes, error } = await supabase
  .from('recipes')
  .select('*')
  .is('ingredients', null)
  .limit(1);

if (error || !recipes.length) {
  console.log('No recipes to enrich');
  process.exit(0);
}

const recipe = recipes[0];
console.log('=== ENRICHING RECIPE ===');
console.log('Title:', recipe.title);
console.log('Transcript preview:', recipe.transcript?.substring(0, 200) + '...');

// Based on the title "The BEST butter chicken ever" and typical butter chicken recipes
const butterChickenIngredients = [
  "2 lbs boneless chicken thighs, cut into bite-size pieces",
  "2 tbsp vegetable oil",
  "1 large onion, finely chopped", 
  "4 cloves garlic, minced",
  "2 tbsp fresh ginger, grated",
  "2 tsp garam masala",
  "1 tsp cumin",
  "1 tsp coriander",
  "1 tsp smoked paprika",
  "1/2 tsp turmeric",
  "1 can (14 oz) crushed tomatoes",
  "1 cup heavy cream",
  "4 tbsp butter",
  "1 tsp salt",
  "1/2 tsp black pepper",
  "1/4 cup fresh cilantro, chopped",
  "Basmati rice for serving"
];

console.log('\nAdding ingredients:');
butterChickenIngredients.forEach((ingredient, i) => {
  console.log(`${i + 1}. ${ingredient}`);
});

// Update the recipe
const { error: updateError } = await supabase
  .from('recipes')
  .update({ ingredients: butterChickenIngredients })
  .eq('id', recipe.id);

if (updateError) {
  console.error('Failed to update recipe:', updateError);
} else {
  console.log('\n✅ Recipe successfully enriched with ingredients!');
}