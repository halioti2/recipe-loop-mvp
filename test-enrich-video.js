/**
 * TEST ENRICHMENT FOR A SPECIFIC VIDEO
 * 
 * Tests the enrichment process (transcript + ingredients) for a specific YouTube video.
 * 
 * USAGE:
 *   node test-enrich-video.js <youtube_url_or_video_id>
 * 
 * EXAMPLES:
 *   node test-enrich-video.js https://www.youtube.com/watch?v=dQw4w9WgXcQ
 *   node test-enrich-video.js https://youtu.be/dQw4w9WgXcQ
 *   node test-enrich-video.js dQw4w9WgXcQ
 * 
 * WHAT IT DOES:
 * 1. Looks up the recipe by video_id in the database
 * 2. Shows current transcript status
 * 3. Calls Gemini API to extract ingredients from transcript
 * 4. Updates the recipe with ingredients
 * 
 * REQUIREMENTS:
 * - Video must already be synced (exist in recipes table)
 * - Video must have a transcript
 * - .env with GEMINI_API_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const input = process.argv[2];

if (!input) {
  console.error('❌ Please provide a YouTube URL or video ID');
  console.log('Usage: node test-enrich-video.js <youtube_url_or_video_id>');
  console.log('');
  console.log('Examples:');
  console.log('  node test-enrich-video.js https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  console.log('  node test-enrich-video.js https://youtu.be/dQw4w9WgXcQ');
  console.log('  node test-enrich-video.js dQw4w9WgXcQ');
  process.exit(1);
}

// Extract video ID from URL if provided
function extractVideoId(input) {
  // If it's already just an ID (11 characters, no special chars except - and _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }
  
  // Try to extract from various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,  // youtube.com/watch?v=ID
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,              // youtu.be/ID
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,    // youtube.com/embed/ID
  ];
  
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

const videoId = extractVideoId(input);

if (!videoId) {
  console.error('❌ Could not extract video ID from input:', input);
  console.log('Please provide a valid YouTube URL or video ID');
  process.exit(1);
}

console.log('=== ENRICH SPECIFIC VIDEO ===');
console.log('Input:', input);
console.log('Video ID:', videoId);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiKey) {
  console.error('❌ Missing required environment variables');
  console.error('Need: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, GEMINI_API_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Call Gemini API to extract ingredients
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
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

async function enrichVideo() {
  try {
    // 1. Find the recipe by video_url (contains the video ID)
    console.log('\n1. Looking up recipe in database...');
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('*')
      .ilike('video_url', `%${videoId}%`)
      .limit(1);

    if (error) {
      console.error('❌ Database error:', error.message);
      process.exit(1);
    }

    if (!recipes || recipes.length === 0) {
      console.error('❌ Recipe not found with video ID:', videoId);
      console.log('\n💡 TIP: Make sure the video has been synced first via playlist-sync');
      process.exit(1);
    }

    const recipe = recipes[0];

    console.log('✅ Found recipe:');
    console.log('   Title:', recipe.title);
    console.log('   Channel:', recipe.channel);
    console.log('   Has transcript:', recipe.transcript ? 'Yes' : 'No');
    console.log('   Has ingredients:', recipe.ingredients ? 'Yes' : 'No');

    // 2. Check if transcript exists
    if (!recipe.transcript) {
      console.error('\n❌ Recipe has no transcript!');
      console.log('This video may not have captions available.');
      process.exit(1);
    }

    console.log('   Transcript length:', recipe.transcript.length, 'characters');

    // 3. Check if already enriched
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      console.log('\n⚠️  Recipe already has ingredients:');
      console.log('   ', recipe.ingredients.slice(0, 3).join('\n    '));
      if (recipe.ingredients.length > 3) {
        console.log('    ... and', recipe.ingredients.length - 3, 'more');
      }
      console.log('\nProceed anyway? (Ctrl+C to cancel, or wait 3 seconds to continue)');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 4. Create prompt for Gemini
    const prompt = `Extract the ingredients used in this recipe as a JSON array of strings.
Each string should be a single ingredient with amount, such as "1 cup flour" or "2 eggs".

Title: ${recipe.title}
Channel: ${recipe.channel}
Summary: ${recipe.summary || ''}
Transcript: ${recipe.transcript}

Return only the JSON array, nothing else.`;

    // 5. Call Gemini API
    console.log('\n2. Calling Gemini API to extract ingredients...');
    const response = await callGeminiAPI(prompt);
    console.log('✅ Gemini response received');

    // 6. Parse response
    console.log('\n3. Parsing ingredients...');
    const jsonText = response.replace(/```json|```/g, '').trim();
    let ingredients;
    try {
      ingredients = JSON.parse(jsonText);
      if (!Array.isArray(ingredients)) {
        throw new Error('Response is not an array');
      }
    } catch (parseError) {
      console.error('❌ Failed to parse Gemini response as JSON:', parseError.message);
      console.error('Raw response:', response);
      process.exit(1);
    }

    console.log('✅ Found', ingredients.length, 'ingredients:');
    ingredients.forEach((ingredient, i) => {
      console.log(`   ${i + 1}. ${ingredient}`);
    });

    // 7. Update database
    console.log('\n4. Updating recipe in database...');
    const { error: updateError } = await supabase
      .from('recipes')
      .update({ ingredients: ingredients })
      .eq('id', recipe.id);

    if (updateError) {
      console.error('❌ Failed to update recipe:', updateError);
      process.exit(1);
    }

    console.log('✅ Successfully enriched recipe!');
    console.log('\n🎉 Done! Recipe is now fully enriched with ingredients.');

  } catch (error) {
    console.error('❌ Enrichment failed:', error.message);
    process.exit(1);
  }
}

enrichVideo();
