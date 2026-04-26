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

// Gemini API configuration — use GOOGLE_AI_KEY to avoid Netlify AI integration override of GEMINI_API_KEY
const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY
const SUPADATA_TRANSCRIPT_URL = 'https://api.supadata.ai/v1/youtube/transcript'

const VALID_CATEGORIES = new Set([
  'produce',
  'meat_seafood',
  'dairy_eggs',
  'bakery',
  'frozen',
  'pantry',
  'other',
])

function normalizeIngredients(parsed) {
  return parsed
    .map(item => {
      if (typeof item === 'string') {
        return { name: item.trim(), category: 'other' }
      }
      const name = typeof item?.name === 'string' ? item.name.trim() : ''
      const rawCat = typeof item?.category === 'string' ? item.category.trim().toLowerCase() : ''
      const category = VALID_CATEGORIES.has(rawCat) ? rawCat : 'other'
      return { name, category }
    })
    .filter(item => item.name.length > 0)
}

// Timing utilities
const timings = {}

function startTimer(label) {
  timings[label] = { start: Date.now() }
}

function endTimer(label) {
  if (timings[label]) {
    timings[label].duration = Date.now() - timings[label].start
    timings[label].end = Date.now()
  }
}

function logTimings() {
  console.log('\n⏱️  TIMING REPORT:')
  Object.entries(timings).forEach(([label, timing]) => {
    console.log(`  ${label}: ${timing.duration}ms`)
  })
  console.log()
}

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers }
  }

  startTimer('total_processor')

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
    startTimer('db_fetch_recipes')
    const { data: recipes, error: fetchError } = await supabase
      .from('recipes')
      .select('id, title, video_url, transcript, ingredients, youtube_video_id, enrich_attempt_count')
      .in('id', recipesToProcess)
    endTimer('db_fetch_recipes')
    console.log(`⏱️  DB fetch took ${timings.db_fetch_recipes.duration}ms for ${recipesToProcess.length} recipes`)

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
      const recipeStartTime = Date.now()
      const recipeKey = `recipe_${recipe.id}`
      timings[recipeKey] = { steps: {} }

      try {
        console.log(`🔄 Processing: ${recipe.title}`)

        let needsTranscript = !recipe.transcript
        let needsIngredients = !recipe.ingredients ||
          (Array.isArray(recipe.ingredients) && recipe.ingredients.length === 0)

        let transcript = recipe.transcript
        let ingredients = recipe.ingredients


        // Get transcript if needed
        let transcriptFailed = false
        const MAX_ENRICH_ATTEMPTS = 3
        if (needsTranscript) {
          try {
            startTimer(`${recipeKey}_enrich_to_transcript_call`)
            const match = recipe.video_url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)
            const videoId = match ? match[1] : recipe.video_url.slice(-11)

            startTimer(`${recipeKey}_transcript_fetch`)
            const transcriptResponse = await fetch(
              `${SUPADATA_TRANSCRIPT_URL}?videoId=${videoId}`,
              { headers: { 'x-api-key': SUPADATA_API_KEY } }
            )
            endTimer(`${recipeKey}_transcript_fetch`)
            timings[recipeKey].steps.transcript_fetch = timings[`${recipeKey}_transcript_fetch`].duration

            if (transcriptResponse.ok) {
              startTimer(`${recipeKey}_transcript_parse`)
              const transcriptData = await transcriptResponse.json()
              endTimer(`${recipeKey}_transcript_parse`)
              timings[recipeKey].steps.transcript_parse = timings[`${recipeKey}_transcript_parse`].duration

              if (transcriptData.content && transcriptData.content.length > 0) {
                transcript = transcriptData.content.map(c => c.text).join(' ')
                console.log(`✅ Transcript fetched for: ${recipe.title}`)
              } else {
                console.log(`⚠️  Empty transcript for: ${recipe.title}`)
                transcriptFailed = true
              }
            } else {
              console.log(`⚠️  Could not fetch transcript for: ${recipe.title} (HTTP ${transcriptResponse.status})`)
              transcriptFailed = true
            }
            endTimer(`${recipeKey}_enrich_to_transcript_call`)
            timings[recipeKey].steps.enrich_to_transcript_call = timings[`${recipeKey}_enrich_to_transcript_call`].duration
          } catch (transcriptError) {
            console.error(`❌ Transcript error for ${recipe.title}:`, transcriptError)
            transcriptFailed = true
          }
        }

        // Generate ingredients if needed and we have a transcript
        if (needsIngredients && transcript) {
          try {
            startTimer(`${recipeKey}_transcript_to_gemini_call`)

            const prompt = `Extract the ingredients from this recipe transcript. Return ONLY a JSON array of objects with this exact shape:
[{"name": "1 cup flour", "category": "pantry"}, {"name": "2 eggs", "category": "dairy_eggs"}]

Each "name" must include quantity and measurement when stated.

Each "category" MUST be exactly one of these seven values (lowercase, snake_case):
- "produce"        — fresh fruits, vegetables, fresh herbs
- "meat_seafood"   — raw meat, poultry, fish, shellfish
- "dairy_eggs"     — milk, cheese, yogurt, butter, cream, eggs
- "bakery"         — bread, tortillas, baked goods (NOT flour/sugar/baking ingredients — those are pantry)
- "frozen"         — anything sold frozen
- "pantry"         — shelf-stable: flour, sugar, oil, vinegar, spices, dried herbs, sauces, condiments, pasta, rice, canned goods, stock, baking ingredients
- "other"          — anything that does not clearly fit above (beverages, garnishes, non-food)

Do not invent categories. Do not use any value outside this list. If unsure, use "other".
Return only the JSON array — no prose, no markdown fences.

Transcript: ${transcript}`

            startTimer(`${recipeKey}_gemini_api`)
            const geminiResponse = await fetch(GEMINI_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
              body: JSON.stringify({
                contents: [{
                  parts: [{ text: prompt }]
                }],
                generationConfig: {
                  thinkingConfig: { thinkingBudget: 0 }
                }
              })
            })
            endTimer(`${recipeKey}_gemini_api`)
            timings[recipeKey].steps.gemini_api = timings[`${recipeKey}_gemini_api`].duration

            if (geminiResponse.ok) {
              startTimer(`${recipeKey}_gemini_parse`)
              const geminiResult = await geminiResponse.json()
              endTimer(`${recipeKey}_gemini_parse`)
              timings[recipeKey].steps.gemini_parse = timings[`${recipeKey}_gemini_parse`].duration

              const generatedText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text

              if (generatedText) {
                // Try to parse the JSON response
                const cleanedText = generatedText.replace(/```json\n?|\n?```/g, '').trim()
                const parsedIngredients = JSON.parse(cleanedText)

                if (Array.isArray(parsedIngredients) && parsedIngredients.length > 0) {
                  ingredients = normalizeIngredients(parsedIngredients)
                  console.log(`✅ Ingredients generated for: ${recipe.title}`)
                } else {
                  console.log(`⚠️  Invalid ingredients format for: ${recipe.title}`)
                }
              }
            } else {
              const errText = await geminiResponse.text()
              const errMsg = `Gemini ${geminiResponse.status}: ${errText.slice(0, 200)}`
              console.error(`❌ Gemini API error for ${recipe.title}: ${errMsg}`)
              results.errors.push({ recipe_id: recipe.id, title: recipe.title, error: errMsg })
            }
            endTimer(`${recipeKey}_transcript_to_gemini_call`)
            timings[recipeKey].steps.transcript_to_gemini_call = timings[`${recipeKey}_transcript_to_gemini_call`].duration
          } catch (ingredientsError) {
            console.error(`❌ Ingredients error for ${recipe.title}:`, ingredientsError)
            results.errors.push({ recipe_id: recipe.id, title: recipe.title, error: ingredientsError.message })
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
        if (transcriptFailed) {
          updates.enrich_attempt_count = (recipe.enrich_attempt_count ?? 0) + 1
          console.log(`⚠️  Recording failed attempt ${updates.enrich_attempt_count}/${MAX_ENRICH_ATTEMPTS} for: ${recipe.title}`)
        }

        if (Object.keys(updates).length > 0) {
          startTimer(`${recipeKey}_db_update`)
          const { error: updateError } = await supabase
            .from('recipes')
            .update(updates)
            .eq('id', recipe.id)
          endTimer(`${recipeKey}_db_update`)
          timings[recipeKey].steps.db_update = timings[`${recipeKey}_db_update`].duration

          if (updateError) {
            throw new Error(`Database update failed: ${updateError.message}`)
          }
        }

        results.processed++
        timings[recipeKey].total = Date.now() - recipeStartTime
        console.log(`⏱️  ${recipe.title} breakdown: ${JSON.stringify(timings[recipeKey].steps)} (total: ${timings[recipeKey].total}ms)`)

      } catch (recipeError) {
        console.error(`❌ Error processing ${recipe.title}:`, recipeError)
        results.errors.push({
          recipe_id: recipe.id,
          title: recipe.title,
          error: recipeError.message
        })
      }
    }

    endTimer('total_processor')

    console.log('📊 Batch Processing Complete:')
    console.log(`- Processed: ${results.processed}/${recipesToProcess.length}`)
    console.log(`- Transcripts added: ${results.successful_transcript}`)
    console.log(`- Ingredients added: ${results.successful_ingredients}`)
    console.log(`- Errors: ${results.errors.length}`)
    console.log(`- Remaining: ${results.remaining_recipe_ids.length}`)
    logTimings()

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        batch_size: recipesToProcess.length,
        ...results,
        has_more: results.remaining_recipe_ids.length > 0,
        message: `Processed ${results.processed} recipes. ${results.remaining_recipe_ids.length} remaining.`,
        timings: timings
      })
    }

  } catch (error) {
    console.error('❌ Playlist enrich processor error:', error)
    endTimer('total_processor')
    logTimings()
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error during enrichment processing',
        message: error.message,
        timings: timings
      })
    }
  }
}