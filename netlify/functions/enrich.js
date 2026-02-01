import { supabase } from '../../src/lib/supabaseClient.js';

const TRANSCRIPT_API_URL = 'https://transcript-microservice.fly.dev/transcript';

// Use direct Gemini API instead of Vertex AI
async function callGeminiAPI(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
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
        maxOutputTokens: 512,
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  // Check for required environment variables
  const geminiApiKey = process.env.GEMINI_API_KEY;
  
  if (!geminiApiKey) {
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Missing GEMINI_API_KEY environment variable' }) 
    };
  }

  try {
    // Get recipes that need enrichment (no ingredients yet)
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('id, title, channel, summary, video_url, transcript')
      .is('ingredients', null);

    if (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }

    if (!recipes.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'no recipes to enrich' }) };
    }

    let successCount = 0;
    let errors = [];

    for (const recipe of recipes) {
      console.log(`🔄 Processing recipe: "${recipe.title}"`);
      
      // Use existing transcript if available, otherwise try to fetch it
      let transcript = recipe.transcript || '';
      
      if (!transcript && recipe.video_url) {
        let videoId = '';
        const match = recipe.video_url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
        videoId = match ? match[1] : recipe.video_url.slice(-11);
        
        if (videoId) {
          try {
            const res = await fetch(`${TRANSCRIPT_API_URL}?video_id=${videoId}`);
            const data = await res.json();
            transcript = data.transcript || '';
            console.log(`🌐 Fetched transcript for ${videoId} (${transcript.length} chars)`);
          } catch (e) {
            console.warn(`⚠️ Transcript fetch failed for ${videoId}:`, e.message);
          }
        }
      }

      // Create the prompt for Gemini
      const prompt = `Extract the ingredients used in this recipe as a JSON array of strings.
Each string should be a single ingredient with amount, such as "1 cup flour" or "2 eggs".
Return ONLY the JSON array, nothing else.

Title: ${recipe.title}
Channel: ${recipe.channel || 'Unknown'}
${recipe.summary ? `Summary: ${recipe.summary}` : ''}
${transcript ? `Transcript: ${transcript}` : ''}`;

      console.log(`📝 Calling Gemini API for recipe ${recipe.id}`);

      try {
        // Call the direct Gemini API
        const response = await callGeminiAPI(prompt, geminiApiKey);
        console.log(`📨 Gemini response for ${recipe.id}:`, response.substring(0, 200) + '...');

        // Parse the JSON response
        const jsonText = response.replace(/```json|```/g, '').trim();
        let ingredients;
        
        try {
          ingredients = JSON.parse(jsonText);
          if (!Array.isArray(ingredients)) {
            throw new Error('Response is not an array');
          }
        } catch (parseError) {
          const errorMsg = `Parse error for ${recipe.id}: ${parseError.message}`;
          console.error(`❌ ${errorMsg}`);
          console.error(`Raw response: ${response}`);
          errors.push(errorMsg);
          continue;
        }

        // Update the recipe with ingredients
        const { error: updateError } = await supabase
          .from('recipes')
          .update({ ingredients: ingredients })
          .eq('id', recipe.id);

        if (updateError) {
          const errorMsg = `Database update error for ${recipe.id}: ${updateError.message}`;
          console.error(`❌ ${errorMsg}`);
          errors.push(errorMsg);
          continue;
        }

        successCount++;
        console.log(`✅ Successfully enriched "${recipe.title}" with ${ingredients.length} ingredients`);

      } catch (apiError) {
        const errorMsg = `Gemini API error for ${recipe.id}: ${apiError.message}`;
        console.error(`❌ ${errorMsg}`);
        errors.push(errorMsg);
        continue;
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'enriched',
        updated: successCount,
        skipped: recipes.length - successCount,
        errors: errors.length > 0 ? errors : undefined
      }),
    };

  } catch (err) {
    console.error('enrich error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Unknown error' }) };
  }
}
