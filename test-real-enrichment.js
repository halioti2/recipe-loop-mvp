/**
 * REAL GEMINI ENRICHMENT TEST
 * 
 * This test verifies that recipe enrichment works with the real Gemini API,
 * using actual recipes from the database and updating them with ingredients.
 * 
 * HOW TO RUN:
 * NODE_ENV=development node -r dotenv/config test-real-enrichment.js
 * 
 * REQUIREMENTS:
 * - .env file with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and GEMINI_API_KEY
 * - Active Supabase database with recipes that have transcripts but no ingredients
 * - Valid Gemini API key with sufficient quota
 * - Update permissions on recipes table
 * 
 * WHAT IT TESTS:
 * - Recipe selection for enrichment
 * - Gemini API integration with proper prompt formatting
 * - Ingredient extraction and parsing
 * - Database updates with JSONB array
 * - Error handling for API failures
 * 
 * NOTE: This test modifies real data in your database!
 */

// Enhanced enrichment script using direct Gemini API (no Google Auth required)
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

console.log('=== REAL GEMINI ENRICHMENT TEST ===');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiKey) {
  console.error('Missing required environment variables');
  console.error('Need: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, GEMINI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Use the direct Gemini API instead of Vertex AI
async function callGeminiAPI(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        maxOutputTokens: 1024, // Increased from 256 to prevent truncation
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function realEnrichment() {
  try {
    console.log('1. Finding recipes that need enrichment...');
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('*')
      .is('ingredients', null)
      .limit(2); // Process 2 at a time to avoid rate limits

    if (error) {
      throw error;
    }

    console.log(`Found ${recipes.length} recipes that need enrichment`);

    if (recipes.length === 0) {
      console.log('No recipes found that need enrichment!');
      return;
    }

    let successCount = 0;

    for (const recipe of recipes) {
      console.log(`\n2. Processing: "${recipe.title}"`);
      
      if (!recipe.transcript) {
        console.log('  ⚠️  No transcript available, skipping...');
        continue;
      }

      // Create the prompt for Gemini
      const prompt = `Extract the ingredients used in this recipe as a JSON array of strings.
Each string should be a single ingredient with amount, such as "1 cup flour" or "2 eggs".

Title: ${recipe.title}
Channel: ${recipe.channel}
Summary: ${recipe.summary || ''}
Transcript: ${recipe.transcript}

Return only the JSON array, nothing else.`;

      console.log('  🤖 Calling Gemini API...');
      try {
        const response = await callGeminiAPI(prompt);
        console.log('  📨 Gemini response:', response.substring(0, 200) + '...');

        // Parse the JSON response
        const jsonText = response.replace(/```json|```/g, '').trim();
        let ingredients;
        try {
          ingredients = JSON.parse(jsonText);
          if (!Array.isArray(ingredients)) {
            throw new Error('Response is not an array');
          }
        } catch (parseError) {
          console.error('  ❌ Failed to parse Gemini response as JSON:', parseError.message);
          console.error('  Raw response:', response);
          continue;
        }

        // Update the recipe with ingredients
        console.log('  💾 Updating recipe with ingredients...');
        const { error: updateError } = await supabase
          .from('recipes')
          .update({ ingredients: ingredients })
          .eq('id', recipe.id);

        if (updateError) {
          console.error('  ❌ Failed to update recipe:', updateError);
        } else {
          successCount++;
          console.log('  ✅ Successfully enriched recipe!');
          console.log('  📝 Ingredients:', ingredients.slice(0, 3).join(', ') + (ingredients.length > 3 ? '...' : ''));
        }

      } catch (apiError) {
        console.error('  ❌ Gemini API call failed:', apiError.message);
      }
    }

    console.log(`\n🎉 Enrichment completed! Successfully enriched ${successCount} out of ${recipes.length} recipes.`);

  } catch (error) {
    console.error('❌ Enrichment failed:', error);
  }
}

realEnrichment();