// Simplified enrichment test that doesn't rely on Google Auth
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

console.log('=== SIMPLIFIED ENRICHMENT TEST ===');

// Load environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiKey = process.env.VITE_GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Mock the Gemini API call for testing
async function mockGeminiCall(transcript) {
  // This is a mock response - in production this would call the real Gemini API
  console.log('Mock Gemini API call for transcript of length:', transcript.length);
  
  return {
    ingredients: [
      { name: "chicken breast", amount: "2 lbs", category: "protein" },
      { name: "olive oil", amount: "2 tbsp", category: "oil" },
      { name: "salt", amount: "1 tsp", category: "seasoning" },
      { name: "pepper", amount: "1/2 tsp", category: "seasoning" }
    ]
  };
}

async function testEnrichment() {
  try {
    // 1. Get recipes that need enrichment (no ingredients yet)
    console.log('1. Finding recipes that need enrichment...');
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('*')
      .is('ingredients', null)
      .limit(3);

    if (error) {
      throw error;
    }

    console.log(`Found ${recipes.length} recipes that need enrichment`);

    if (recipes.length === 0) {
      console.log('No recipes found that need enrichment!');
      return;
    }

    // 2. Process each recipe
    for (const recipe of recipes) {
      console.log(`\n2. Processing: "${recipe.title}"`);
      
      if (!recipe.transcript) {
        console.log('  ⚠️  No transcript available, skipping...');
        continue;
      }

      // 3. Mock call to Gemini API
      console.log('  🤖 Calling mock Gemini API...');
      const result = await mockGeminiCall(recipe.transcript);

      // 4. Update the recipe with ingredients
      console.log('  💾 Updating recipe with ingredients...');
      const { error: updateError } = await supabase
        .from('recipes')
        .update({ ingredients: result.ingredients })
        .eq('id', recipe.id);

      if (updateError) {
        console.error('  ❌ Failed to update recipe:', updateError);
      } else {
        console.log('  ✅ Successfully enriched recipe!');
        console.log('  📝 Ingredients:', result.ingredients.map(i => `${i.amount} ${i.name}`).join(', '));
      }
    }

    console.log('\n🎉 Enrichment test completed!');

  } catch (error) {
    console.error('❌ Enrichment test failed:', error);
  }
}

testEnrichment();