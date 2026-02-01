import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

// Validate environment variables before creating client
if (!process.env.VITE_SUPABASE_URL) {
  console.error('❌ Missing VITE_SUPABASE_URL environment variable');
  process.exit(1);
}

if (!process.env.VITE_SUPABASE_ANON_KEY) {
  console.error('❌ Missing VITE_SUPABASE_ANON_KEY environment variable');
  process.exit(1);
}

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

if (fetchError) {
  console.error('❌ Failed to fetch recipes:', fetchError.message);
  process.exit(1);
}

console.log('Recipes that need enrichment:', recipes?.length || 0);
if (recipes?.length > 0) {
  console.log('Recipe:', recipes[0].title);
  console.log('Has transcript:', !!recipes[0].transcript);
}