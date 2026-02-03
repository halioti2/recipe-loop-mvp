/**
 * Playlist Enrich Processor - Phase 2.3
 * Processes a batch of recipes for transcript and ingredient enrichment
 * 
 * Takes a list of recipe IDs and enriches them using Gemini API
 * Designed to work in batches to avoid timeout issues
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Gemini API configuration
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent'

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers }
  }

  try {
    const { recipe_ids, max_batch_size = 5 } = JSON.parse(event.body)
    
    if (!recipe_ids || !Array.isArray(recipe_ids) || recipe_ids.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'recipe_ids array required' })
      }
    }

    // Limit batch size to prevent timeouts
    const batchSize = Math.min(max_batch_size, recipe_ids.length)
    const recipesToProcess = recipe_ids.slice(0, batchSize)

    console.log(`🔄 Processing ${recipesToProcess.length} recipes for enrichment`)

    // Get recipe details
    const { data: recipes, error: fetchError } = await supabase
      .from('recipes')
      .select('id, title, video_url, transcript, ingredients, youtube_video_id')
      .in('id', recipesToProcess)

    if (fetchError) {
      throw new Error(`Failed to fetch recipes: ${fetchError.message}`)
    }

    const results = {
      processed: 0,
      successful_transcript: 0,
      successful_ingredients: 0,
      errors: [],
      remaining_recipe_ids: recipe_ids.slice(batchSize)
    }

    for (const recipe of recipes) {
      try {
        console.log(`🔄 Processing: ${recipe.title}`)
        
        let needsTranscript = !recipe.transcript
        let needsIngredients = !recipe.ingredients || 
          (Array.isArray(recipe.ingredients) && recipe.ingredients.length === 0)

        let transcript = recipe.transcript
        let ingredients = recipe.ingredients

        // Get transcript if needed
        if (needsTranscript) {
          try {
            const transcriptResponse = await fetch(`/.netlify/functions/transcript-fill`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ video_url: recipe.video_url })
            })

            if (transcriptResponse.ok) {
              const transcriptResult = await transcriptResponse.json()
              transcript = transcriptResult.transcript
              console.log(`✅ Transcript fetched for: ${recipe.title}`)
            } else {
              console.log(`⚠️  Could not fetch transcript for: ${recipe.title}`)
            }
          } catch (transcriptError) {
            console.error(`❌ Transcript error for ${recipe.title}:`, transcriptError)
          }
        }

        // Generate ingredients if needed and we have a transcript
        if (needsIngredients && transcript) {
          try {
            const prompt = `Extract the ingredients from this recipe transcript. Return only a JSON array of ingredient strings (e.g., ["1 cup flour", "2 eggs", "1 tsp salt"]). Be specific about quantities and measurements.

Transcript: ${transcript.substring(0, 2000)}`

            const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: prompt }]
                }]
              })
            })

            if (geminiResponse.ok) {
              const geminiResult = await geminiResponse.json()
              const generatedText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text

              if (generatedText) {
                // Try to parse the JSON response
                const cleanedText = generatedText.replace(/```json\n?|\n?```/g, '').trim()
                const parsedIngredients = JSON.parse(cleanedText)
                
                if (Array.isArray(parsedIngredients) && parsedIngredients.length > 0) {
                  ingredients = parsedIngredients
                  console.log(`✅ Ingredients generated for: ${recipe.title}`)
                } else {
                  console.log(`⚠️  Invalid ingredients format for: ${recipe.title}`)
                }
              }
            }
          } catch (ingredientsError) {
            console.error(`❌ Ingredients error for ${recipe.title}:`, ingredientsError)
          }
        }

        // Update the recipe if we have new data
        const updates = {}
        if (needsTranscript && transcript) {
          updates.transcript = transcript
          results.successful_transcript++
        }
        if (needsIngredients && ingredients) {
          updates.ingredients = ingredients
          results.successful_ingredients++
        }

        if (Object.keys(updates).length > 0) {
          const { error: updateError } = await supabase
            .from('recipes')
            .update(updates)
            .eq('id', recipe.id)

          if (updateError) {
            throw new Error(`Database update failed: ${updateError.message}`)
          }
        }

        results.processed++

      } catch (recipeError) {
        console.error(`❌ Error processing ${recipe.title}:`, recipeError)
        results.errors.push({
          recipe_id: recipe.id,
          title: recipe.title,
          error: recipeError.message
        })
      }
    }

    console.log('📊 Batch Processing Complete:')
    console.log(`- Processed: ${results.processed}/${recipesToProcess.length}`)
    console.log(`- Transcripts added: ${results.successful_transcript}`)
    console.log(`- Ingredients added: ${results.successful_ingredients}`)
    console.log(`- Errors: ${results.errors.length}`)
    console.log(`- Remaining: ${results.remaining_recipe_ids.length}`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        batch_size: recipesToProcess.length,
        ...results,
        has_more: results.remaining_recipe_ids.length > 0,
        message: `Processed ${results.processed} recipes. ${results.remaining_recipe_ids.length} remaining.`
      })
    }

  } catch (error) {
    console.error('❌ Playlist enrich processor error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error during enrichment processing',
        message: error.message 
      })
    }
  }
}