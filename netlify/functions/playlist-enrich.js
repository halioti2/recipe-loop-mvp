/**
 * Playlist Enrich Orchestrator - Phase 2.3
 * Coordinates the complete enrichment process for active playlists
 * 
 * 1. Finds recipes needing enrichment
 * 2. Processes them in batches
 * 3. Returns comprehensive results
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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
    const { user_id, batch_size = 3, max_recipes = 15 } = JSON.parse(event.body)
    
    if (!user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'user_id required' })
      }
    }

    console.log(`🚀 Starting enrichment orchestration for user: ${user_id}`)

    // Step 1: Find recipes needing enrichment
    const finderResponse = await fetch(`${process.env.URL}/.netlify/functions/playlist-enrich-finder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id })
    })

    if (!finderResponse.ok) {
      throw new Error('Failed to find recipes for enrichment')
    }

    const finderResult = await finderResponse.json()
    
    if (!finderResult.success || finderResult.recipes.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No recipes found needing enrichment',
          stats: finderResult.stats,
          total_processed: 0,
          total_enriched: 0
        })
      }
    }

    // Limit the number of recipes to process
    const recipesToEnrich = finderResult.recipes
      .slice(0, max_recipes)
      .map(r => r.recipe_id)

    console.log(`📋 Found ${finderResult.recipes.length} recipes, processing ${recipesToEnrich.length}`)

    // Step 2: Process recipes in batches
    let remainingRecipes = recipesToEnrich
    let totalProcessed = 0
    let totalTranscripts = 0
    let totalIngredients = 0
    let allErrors = []

    while (remainingRecipes.length > 0) {
      console.log(`🔄 Processing batch of ${Math.min(batch_size, remainingRecipes.length)} recipes`)

      const processorResponse = await fetch(`${process.env.URL}/.netlify/functions/playlist-enrich-processor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          recipe_ids: remainingRecipes,
          max_batch_size: batch_size
        })
      })

      if (!processorResponse.ok) {
        console.error('❌ Batch processing failed')
        break
      }

      const processorResult = await processorResponse.json()
      
      if (!processorResult.success) {
        console.error('❌ Processor returned error:', processorResult.error)
        break
      }

      // Accumulate results
      totalProcessed += processorResult.processed
      totalTranscripts += processorResult.successful_transcript
      totalIngredients += processorResult.successful_ingredients
      allErrors = allErrors.concat(processorResult.errors || [])

      // Update remaining recipes
      remainingRecipes = processorResult.remaining_recipe_ids || []

      console.log(`✅ Batch complete. ${remainingRecipes.length} recipes remaining`)

      // Small delay between batches to avoid rate limits
      if (remainingRecipes.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // Step 3: Generate final summary
    const finalStats = {
      recipes_found: finderResult.recipes.length,
      recipes_processed: totalProcessed,
      transcripts_added: totalTranscripts,
      ingredients_added: totalIngredients,
      total_enriched: totalTranscripts + totalIngredients,
      errors: allErrors.length,
      success_rate: totalProcessed > 0 ? ((totalProcessed - allErrors.length) / totalProcessed * 100).toFixed(1) + '%' : '0%',
      playlists_affected: finderResult.stats.playlists_involved.length
    }

    console.log('🎉 Enrichment Orchestration Complete:')
    console.log(`- Recipes found: ${finalStats.recipes_found}`)
    console.log(`- Recipes processed: ${finalStats.recipes_processed}`)
    console.log(`- Total enrichments: ${finalStats.total_enriched}`)
    console.log(`- Success rate: ${finalStats.success_rate}`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        stats: finalStats,
        errors: allErrors,
        playlists: finderResult.stats.playlists_involved,
        message: `Enrichment complete! Processed ${finalStats.recipes_processed} recipes with ${finalStats.total_enriched} enrichments across ${finalStats.playlists_affected} playlists.`
      })
    }

  } catch (error) {
    console.error('❌ Enrichment orchestration error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error during enrichment orchestration',
        message: error.message 
      })
    }
  }
}