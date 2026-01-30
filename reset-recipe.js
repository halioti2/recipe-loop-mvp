import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Reset ingredients to null so we can test enrichment
const { error } = await supabase
  .from('recipes')
  .update({ ingredients: null })
  .eq('title', 'The BEST butter chicken ever 😍 #Shorts');

console.log('Reset ingredients for testing:', error ? error : 'Success');

// Check what recipes need enrichment
const { data: recipes, error: fetchError } = await supabase
  .from('recipes')
  .select('id, title, ingredients, transcript')
  .is('ingredients', null);

console.log('Recipes that need enrichment:', recipes?.length || 0);
if (recipes?.length > 0) {
  console.log('Recipe:', recipes[0].title);
  console.log('Has transcript:', !!recipes[0].transcript);
}