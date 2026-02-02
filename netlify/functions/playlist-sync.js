/**
 * Smart Playlist Sync Implementation
 * Phase 2.3: Intelligent video matching and deduplication
 * 
 * Key Features:
 * - Avoid duplicate recipes when same video appears in multiple playlists
 * - Smart URL matching to find existing recipes
 * - User-specific playlist associations
 * - Comprehensive sync logging
 */

import { createClient } from '@supabase/supabase-js'
import { YouTubeService } from '../src/services/youtubeService.js'

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
    const { user_id, playlist_id, youtube_token } = JSON.parse(event.body || '{}')
    
    if (!user_id || !playlist_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'user_id and playlist_id required' })
      }
    }

    // Get playlist details
    const { data: playlist } = await supabase
      .from('user_playlists')
      .select('*')
      .eq('id', playlist_id)
      .eq('user_id', user_id)
      .single()

    if (!playlist) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Playlist not found' })
      }
    }

    // Start sync log
    const { data: syncLog } = await supabase
      .from('playlist_sync_logs')
      .insert([{
        user_id,
        playlist_id,
        youtube_playlist_id: playlist.youtube_playlist_id,
        status: 'running'
      }])
      .select()
      .single()

    let recipesAdded = 0
    let recipesLinked = 0
    let recipesSkipped = 0
    let errors = []

    try {
      // Fetch playlist videos from YouTube
      const youtubeService = new YouTubeService(youtube_token)
      const playlistVideos = await youtubeService.getPlaylistVideos(playlist.youtube_playlist_id, 50)

      // Process each video with smart matching
      for (const [index, video] of playlistVideos.entries()) {
        try {
          const result = await processPlaylistVideo(video, user_id, playlist, index)
          
          if (result.action === 'added') recipesAdded++
          else if (result.action === 'linked') recipesLinked++
          else if (result.action === 'skipped') recipesSkipped++
          
        } catch (error) {
          console.error(`Error processing video ${video.snippet?.title}:`, error)
          errors.push({
            video_title: video.snippet?.title,
            error: error.message
          })
          recipesSkipped++
        }
      }

      // Update playlist sync status
      await supabase
        .from('user_playlists')
        .update({ 
          last_synced: new Date().toISOString(),
          video_count: playlistVideos.length 
        })
        .eq('id', playlist_id)

      // Complete sync log
      await supabase
        .from('playlist_sync_logs')
        .update({
          sync_completed: new Date().toISOString(),
          recipes_added: recipesAdded,
          recipes_updated: recipesLinked,
          recipes_skipped: recipesSkipped,
          errors: errors.length > 0 ? errors : null,
          status: 'completed'
        })
        .eq('id', syncLog.id)

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          playlist: playlist.title,
          summary: {
            added: recipesAdded,
            linked: recipesLinked, 
            skipped: recipesSkipped,
            total: playlistVideos.length,
            errors: errors.length
          }
        })
      }

    } catch (syncError) {
      // Mark sync as failed
      await supabase
        .from('playlist_sync_logs')
        .update({
          sync_completed: new Date().toISOString(),
          status: 'failed',
          errors: [{ error: syncError.message }]
        })
        .eq('id', syncLog.id)

      throw syncError
    }

  } catch (error) {
    console.error('Playlist sync error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    }
  }
}

/**
 * Smart video processing with deduplication logic
 */
async function processPlaylistVideo(video, user_id, playlist, position) {
  const videoId = video.snippet.resourceId.videoId
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`
  
  // Step 1: Check if recipe already exists (smart URL matching)
  const existingRecipe = await findExistingRecipe(videoUrl, videoId)
  
  if (existingRecipe) {
    // Step 2a: Recipe exists - create association if not already linked
    const linked = await linkRecipeToUserPlaylist(existingRecipe.id, user_id, playlist.id, position)
    return {
      action: linked ? 'linked' : 'skipped',
      recipe_id: existingRecipe.id,
      reason: linked ? 'Associated existing recipe with playlist' : 'Recipe already in user playlist'
    }
  } else {
    // Step 2b: Recipe doesn't exist - create new recipe
    const newRecipe = await createNewRecipeFromVideo(video, user_id, playlist, position)
    await linkRecipeToUserPlaylist(newRecipe.id, user_id, playlist.id, position)
    return {
      action: 'added',
      recipe_id: newRecipe.id,
      reason: 'Created new recipe from video'
    }
  }
}

/**
 * Smart recipe matching by URL patterns
 */
async function findExistingRecipe(videoUrl, videoId) {
  // Try multiple matching strategies
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, video_url, youtube_video_id')
    .or(`video_url.eq.${videoUrl},youtube_video_id.eq.${videoId}`)
    .limit(1)

  if (recipes && recipes.length > 0) {
    return recipes[0]
  }

  // Fallback: fuzzy URL matching for different YouTube URL formats
  const { data: fuzzyMatches } = await supabase
    .from('recipes')
    .select('id, video_url')
    .like('video_url', `%${videoId}%`)
    .limit(1)

  return fuzzyMatches && fuzzyMatches.length > 0 ? fuzzyMatches[0] : null
}

/**
 * Create recipe-playlist association
 */
async function linkRecipeToUserPlaylist(recipe_id, user_id, user_playlist_id, position) {
  try {
    // Check if association already exists
    const { data: existing } = await supabase
      .from('recipe_playlist_associations')
      .select('id')
      .eq('recipe_id', recipe_id)
      .eq('user_playlist_id', user_playlist_id)
      .single()

    if (existing) {
      return false // Already linked
    }

    // Create new association
    await supabase
      .from('recipe_playlist_associations')
      .insert([{
        recipe_id,
        user_playlist_id,
        video_position: position
      }])

    return true // Successfully linked
  } catch (error) {
    console.error('Error linking recipe to playlist:', error)
    return false
  }
}

/**
 * Create new recipe from YouTube video data
 */
async function createNewRecipeFromVideo(video, user_id, playlist, position) {
  const videoId = video.snippet.resourceId.videoId
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`

  const recipeData = {
    title: video.snippet.title,
    video_url: videoUrl,
    channel: video.snippet.videoOwnerChannelTitle || 'Unknown',
    user_id: user_id,
    source_playlist_id: playlist.youtube_playlist_id,
    youtube_video_id: videoId,
    playlist_video_position: position,
    sync_status: 'synced', // Ready for enrichment
    created_at: new Date().toISOString(),
    
    // Extract basic metadata
    external_link: extractLinksFromDescription(video.snippet.description),
    
    // Will be filled by enrichment process
    summary: null,
    ingredients: null,
    pinned_comment: null,
    transcript: null
  }

  const { data: newRecipe } = await supabase
    .from('recipes')
    .insert([recipeData])
    .select()
    .single()

  return newRecipe
}

/**
 * Extract external links from video description
 */
function extractLinksFromDescription(description) {
  if (!description) return null
  
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const matches = description.match(urlRegex)
  
  // Return first non-YouTube link
  const externalLinks = matches?.filter(url => !url.includes('youtube.com') && !url.includes('youtu.be'))
  return externalLinks && externalLinks.length > 0 ? externalLinks[0] : null
}