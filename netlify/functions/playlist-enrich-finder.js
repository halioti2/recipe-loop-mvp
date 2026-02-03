/**
 * Playlist Enrich Finder - Phase 2.3
 * Finds recipes from active playlists that need transcript enrichment
 * 
 * Returns a list of recipes that need enrichment instead of processing them
 * This allows for better progress tracking and batch processing
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
    const { user_id } = JSON.parse(event.body)
    
    if (!user_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'user_id required' })
      }
    }

    console.log('🔍 Finding recipes needing enrichment for user:', user_id)

    // Get all recipes from user's active playlists that need transcript enrichment
    const { data: recipesNeedingEnrichment, error: enrichmentError } = await supabase
      .from('user_recipes')
      .select(`
        id,
        recipe_id,
        recipes!inner (
          id,
          title,
          video_url,
          youtube_video_id,
          transcript,
          ingredients
        ),
        user_playlists!inner (
          id,
          title,
          active
        )
      `)
      .eq('user_id', user_id)
      .eq('user_playlists.active', true)
      .or('transcript.is.null,transcript.eq.', { referencedTable: 'recipes' })

    if (enrichmentError) {
      console.error('❌ Error finding recipes needing enrichment:', enrichmentError)
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to find recipes needing enrichment',
          details: enrichmentError.message 
        })
      }
    }

    // Find recipes with missing ingredients (remove SQL filtering, do it in JS)
    const { data: recipesNeedingIngredients, error: ingredientsError } = await supabase
      .from('user_recipes')
      .select(`
        id,
        recipe_id,
        recipes!inner (
          id,
          title,
          video_url,
          youtube_video_id,
          transcript,
          ingredients
        ),
        user_playlists!inner (
          id,
          title,
          active
        )
      `)
      .eq('user_id', user_id)
      .eq('user_playlists.active', true)
      .not('recipes.transcript', 'is', null)

    if (ingredientsError) {
      console.error('❌ Error finding recipes needing ingredients:', ingredientsError)
      // Don't fail completely, just log the error
    }

    // Helper function to check if ingredients are valid
    function hasValidIngredients(ingredients) {
      if (!ingredients) return false
      if (!Array.isArray(ingredients)) return false
      if (ingredients.length === 0) return false
      
      // Check if ingredients contains meaningful data (not just empty strings)
      const meaningfulIngredients = ingredients.filter(ing => 
        ing && typeof ing === 'string' && ing.trim().length > 0
      )
      return meaningfulIngredients.length > 0
    }

    // Filter out recipes that already have valid ingredients
    const filteredIngredientsNeeded = recipesNeedingIngredients?.filter(ur => 
      !hasValidIngredients(ur.recipes.ingredients)
    ) || []

    // Process and categorize the results with better ingredient checking
    const transcriptNeeded = recipesNeedingEnrichment?.map(ur => ({
      user_recipe_id: ur.id,
      recipe_id: ur.recipe_id,
      title: ur.recipes.title,
      video_url: ur.recipes.video_url,
      youtube_video_id: ur.recipes.youtube_video_id,
      playlist: ur.user_playlists.title,
      enrichment_type: 'transcript',
      has_transcript: !!ur.recipes.transcript,
      has_ingredients: hasValidIngredients(ur.recipes.ingredients)
    })) || []

    const ingredientsNeeded = filteredIngredientsNeeded?.map(ur => ({
      user_recipe_id: ur.id,
      recipe_id: ur.recipe_id,
      title: ur.recipes.title,
      video_url: ur.recipes.video_url,
      youtube_video_id: ur.recipes.youtube_video_id,
      playlist: ur.user_playlists.title,
      enrichment_type: 'ingredients',
      has_transcript: !!ur.recipes.transcript,
      has_ingredients: hasValidIngredients(ur.recipes.ingredients)
    })) || []

    // Combine all recipes that need enrichment
    const allRecipesMap = new Map()
    
    transcriptNeeded.forEach(recipe => {
      allRecipesMap.set(recipe.recipe_id, {
        ...recipe,
        needs_transcript: true,
        needs_ingredients: !recipe.has_ingredients
      })
    })
    
    ingredientsNeeded.forEach(recipe => {
      if (allRecipesMap.has(recipe.recipe_id)) {
        const existing = allRecipesMap.get(recipe.recipe_id)
        existing.needs_ingredients = true
      } else {
        allRecipesMap.set(recipe.recipe_id, {
          ...recipe,
          needs_transcript: !recipe.has_transcript,
          needs_ingredients: true
        })
      }
    })

    const allRecipesNeedingEnrichment = Array.from(allRecipesMap.values())

    // Generate summary statistics
    const stats = {
      total_recipes_needing_enrichment: allRecipesNeedingEnrichment.length,
      needs_transcript_only: allRecipesNeedingEnrichment.filter(r => r.needs_transcript && !r.needs_ingredients).length,
      needs_ingredients_only: allRecipesNeedingEnrichment.filter(r => !r.needs_transcript && r.needs_ingredients).length,
      needs_both: allRecipesNeedingEnrichment.filter(r => r.needs_transcript && r.needs_ingredients).length,
      playlists_involved: [...new Set(allRecipesNeedingEnrichment.map(r => r.playlist))],
      estimated_processing_time_minutes: Math.ceil(allRecipesNeedingEnrichment.length * 0.5) // ~30s per recipe
    }

    console.log('📊 Enrichment Analysis Complete:')
    console.log(`- Total recipes needing enrichment: ${stats.total_recipes_needing_enrichment}`)
    console.log(`- Needs transcript: ${stats.needs_transcript_only + stats.needs_both}`)
    console.log(`- Needs ingredients: ${stats.needs_ingredients_only + stats.needs_both}`)
    console.log(`- Playlists: ${stats.playlists_involved.join(', ')}`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        stats,
        recipes: allRecipesNeedingEnrichment,
        message: `Found ${stats.total_recipes_needing_enrichment} recipes needing enrichment across ${stats.playlists_involved.length} active playlists`
      })
    }

  } catch (error) {
    console.error('❌ Playlist enrich finder error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error during enrichment analysis',
        message: error.message 
      })
    }
  }
}