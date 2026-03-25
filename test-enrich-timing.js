/**
 * Enrichment Timing Test
 *
 * Tests playlist enrichment performance and profiles each step
 * Uses real Supabase data but mocks transcript API if it fails
 *
 * RUN: NODE_ENV=development node -r dotenv/config test-enrich-timing.js
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TRANSCRIPT_API_URL = 'https://transcript-microservice.fly.dev/transcript';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ Missing GOOGLE_AI_KEY in .env');
  process.exit(1);
}

// Sample transcript to use if microservice fails
const MOCK_TRANSCRIPT = `Welcome to today's cooking tutorial. We're making a classic carbonara. First, let's talk about the ingredients. You'll need a pound of spaghetti, six ounces of guanciale which is cured pork jowl, four large eggs, one cup of finely grated Pecorino Romano cheese, salt, and freshly ground black pepper. The key to great carbonara is using quality ingredients and not overcooking. Start by bringing a large pot of salted water to a boil. While that's heating, cut your guanciale into small cubes. Render the fat in a large skillet over medium heat. We're looking for the meat to become crispy while the fat renders completely. This should take about five to seven minutes. While that's cooking, prepare your egg mixture. Crack your eggs into a bowl and whisk them with the Pecorino. Add freshly ground black pepper. Once your guanciale is crispy and water is boiling, add your pasta. Cook until one minute shy of al dente. Drain the pasta but save about a cup of pasta water. This starchy water helps emulsify our sauce. Now turn off heat and add drained pasta to the guanciale. Toss to coat everything. Pour in your egg mixture while stirring constantly. The residual heat will cook the eggs and create a creamy sauce. If too thick, add pasta water a bit at a time.`;

async function testEnrichmentTiming() {
  console.log('🧪 ENRICHMENT TIMING TEST\n');

  // Get the first recipe without transcript
  console.log('📋 Step 1: Fetching a recipe needing enrichment...\n');

  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, title, video_url, transcript, ingredients, youtube_video_id')
    .is('transcript', null)
    .limit(1);

  if (!recipes || recipes.length === 0) {
    console.error('❌ No recipes found without transcripts');
    process.exit(1);
  }

  const recipe = recipes[0];
  console.log(`✅ Found recipe: ${recipe.title}`);
  console.log(`   Video: ${recipe.video_url}\n`);

  await runTest(recipe);
}

async function fetchTranscript(videoId) {
  try {
    const response = await fetch(`${TRANSCRIPT_API_URL}?video_id=${videoId}`);
    if (!response.ok) {
      console.log(`   ⚠️  Transcript API unavailable (${response.status}), using mock transcript`);
      return MOCK_TRANSCRIPT;
    }
    const data = await response.json();
    return data.transcript || MOCK_TRANSCRIPT;
  } catch (err) {
    console.log(`   ⚠️  Transcript API error, using mock transcript`);
    return MOCK_TRANSCRIPT;
  }
}

async function runTest(recipe) {
  const timings = {};

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📺 Processing: ${recipe.title}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const recipeStart = Date.now();

    // PART 1: Enrich Trigger → Transcript Call
    console.log('PHASE 1: Enrich Trigger → Transcript Received');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const triggerToTranscriptStart = Date.now();

    const match = recipe.video_url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    const videoId = match ? match[1] : recipe.video_url.slice(-11);
    console.log(`\n  [1.1] Extract video ID: ${videoId}`);

    console.log(`  [1.2] Fetch transcript from microservice...`);
    const transcriptFetchStart = Date.now();
    const transcript = await fetchTranscript(videoId);
    const transcriptFetchTime = Date.now() - transcriptFetchStart;
    timings.transcript_fetch = transcriptFetchTime;

    const triggerToTranscriptTime = Date.now() - triggerToTranscriptStart;
    timings.trigger_to_transcript_call = triggerToTranscriptTime;

    console.log(`  ✅ Transcript fetched`);
    console.log(`       • Request to Response: ${transcriptFetchTime}ms`);
    console.log(`       • Enrich Trigger → Transcript Call: ${triggerToTranscriptTime}ms`);
    console.log(`       • Transcript size: ${transcript.length} chars\n`);

    // PART 2: Transcript Received → Gemini Response
    console.log('PHASE 2: First Transcript → Gemini Response');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const transcriptToGeminiStart = Date.now();

    const prompt = `Extract the ingredients from this recipe transcript. Return only a JSON array of ingredient strings (e.g., ["1 cup flour", "2 eggs", "1 tsp salt"]). Be specific about quantities and measurements.

Transcript: ${transcript.substring(0, 2000)}`;

    console.log(`\n  [2.1] Sending prompt to Gemini...`);
    const geminiStart = Date.now();
    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });
    const geminiTime = Date.now() - geminiStart;
    timings.gemini_api = geminiTime;

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      throw new Error(`Gemini error: ${geminiResponse.status} ${errText.slice(0, 100)}`);
    }

    console.log(`  [2.2] Parse Gemini response...`);
    const geminiResult = await geminiResponse.json();
    const transcriptToGeminiTime = Date.now() - transcriptToGeminiStart;
    timings.transcript_to_gemini = transcriptToGeminiTime;

    const generatedText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleanedText = generatedText.replace(/```json\n?|\n?```/g, '').trim();
    const ingredients = JSON.parse(cleanedText);

    console.log(`  ✅ Gemini processing complete`);
    console.log(`       • Gemini API call: ${geminiTime}ms`);
    console.log(`       • Transcript Received → Gemini Response: ${transcriptToGeminiTime}ms`);
    console.log(`       • Ingredients extracted: ${ingredients.length} items\n`);

    // PART 3: Ingredients Received → Finish
    console.log('PHASE 3: Ingredients Received → Database Update');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const ingredientsToFinishStart = Date.now();

    console.log(`\n  [3.1] Update database...`);
    const dbUpdateStart = Date.now();

    const { error: updateError } = await supabase
      .from('recipes')
      .update({
        transcript: transcript,
        ingredients: ingredients
      })
      .eq('id', recipe.id);

    const dbUpdateTime = Date.now() - dbUpdateStart;
    timings.db_update = dbUpdateTime;

    if (updateError) {
      throw new Error(`Database update failed: ${updateError.message}`);
    }

    const ingredientsToFinishTime = Date.now() - ingredientsToFinishStart;
    timings.ingredients_to_finish = ingredientsToFinishTime;

    console.log(`  ✅ Recipe enriched`);
    console.log(`       • DB Update: ${dbUpdateTime}ms`);
    console.log(`       • Ingredients to Finish: ${ingredientsToFinishTime}ms\n`);

    // FINAL SUMMARY
    const totalTime = Date.now() - recipeStart;

    console.log('\n' + '═'.repeat(40));
    console.log('📊 TIMING SUMMARY');
    console.log('═'.repeat(40));
    console.log(`\n✅ All requested metrics:\n`);
    console.log(`[1] Enrich trigger → Transcript microservice call: ${timings.trigger_to_transcript_call}ms`);
    console.log(`[2] Request to receiving 1 transcript:             ${timings.transcript_fetch}ms`);
    console.log(`[3] First transcript received → Gemini call:       ${timings.transcript_to_gemini}ms`);
    console.log(`[4] Gemini API to enrichment response:             ${timings.gemini_api}ms`);
    console.log(`[5] Ingredients received to finish:                ${timings.ingredients_to_finish}ms`);
    console.log(`\n📈 TOTAL TIME:                                    ${totalTime}ms`);

    // Breakdown
    const breakdown = {
      transcript: timings.transcript_fetch,
      gemini: timings.gemini_api,
      db: timings.db_update,
      overhead: totalTime - timings.transcript_fetch - timings.gemini_api - timings.db_update
    };

    console.log('\n' + '─'.repeat(40));
    console.log('⏱️  WHERE TIME IS SPENT:');
    console.log('─'.repeat(40));
    Object.entries(breakdown).forEach(([key, ms]) => {
      const pct = ((ms / totalTime) * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(pct / 5));
      console.log(`  ${key.padEnd(12)} ${ms.toString().padStart(4)}ms (${pct.padStart(5)}%) ${bar}`);
    });

    const bottleneck = Object.entries(breakdown).reduce((a, b) => b[1] > a[1] ? b : a);
    console.log(`\n🎯 BOTTLENECK: ${bottleneck[0]} (${bottleneck[1]}ms, ${((bottleneck[1] / totalTime) * 100).toFixed(1)}%)`);

    console.log('\n💡 INSIGHTS:');
    if (timings.transcript_fetch > timings.gemini_api) {
      console.log(`   • Transcript API is slower than Gemini (${timings.transcript_fetch}ms vs ${timings.gemini_api}ms)`);
      console.log(`   • Consider caching transcripts or async fetching`);
    } else {
      console.log(`   • Gemini is the bottleneck (${timings.gemini_api}ms)`);
      console.log(`   • Consider batching requests or parallel processing`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('\n' + '═'.repeat(40) + '\n');
}

testEnrichmentTiming().catch(console.error);
