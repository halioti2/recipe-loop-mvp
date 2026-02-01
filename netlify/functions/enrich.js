import { supabase } from '../../src/lib/supabaseClient.js';

const TRANSCRIPT_API_URL = 'https://transcript-microservice.fly.dev/transcript';

// Use direct Gemini API instead of Vertex AI
async function callGeminiAPI(prompt, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000); // 12 second timeout
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
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

    // Clear timeout on successful fetch
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Gemini API request timed out after 12 seconds');
    }
    throw error;
  }
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
      
      // Ensure transcript is capped at 3000 characters for consistency
      if (transcript && transcript.length > 3000) {
        transcript = transcript.slice(0, 3000);
        console.log(`📏 Truncated existing transcript to 3000 characters for "${recipe.title}"`);
      }
      
      if (!transcript && recipe.video_url) {
        let videoId = '';
        const match = recipe.video_url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
        videoId = match ? match[1] : recipe.video_url.slice(-11);
        
        if (videoId) {
          // Create AbortController for transcript fetch timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          try {
            const res = await fetch(`${TRANSCRIPT_API_URL}?video_id=${videoId}`, {
              signal: controller.signal
            });
            
            // Clear timeout on successful fetch
            clearTimeout(timeoutId);
            
            if (!res.ok) {
              throw new Error(`Transcript fetch failed: ${res.status} ${res.statusText}`);
            }
            
            const data = await res.json();
            if (data.transcript) {
              // Cap transcript to 3000 characters (same as transcript-fill.js)
              transcript = data.transcript.slice(0, 3000);
              console.log(`🌐 Fetched transcript for ${videoId} (${data.transcript.length} chars, truncated to ${transcript.length})`);
            }
          } catch (e) {
            clearTimeout(timeoutId);
            
            if (e.name === 'AbortError') {
              console.warn(`⚠️ Transcript fetch timed out for ${videoId} after 10 seconds`);
            } else {
              console.warn(`⚠️ Transcript fetch failed for ${videoId}:`, e.message);
            }
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
