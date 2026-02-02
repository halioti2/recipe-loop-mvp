/**
 * Phase 2.3 Smart Playlist Sync Implementation
 * Updated to use User Recipes architecture with youtube_video_id deduplication
 * 
 * Key Features:
 * - Global recipe deduplication using canonical youtube_video_id
 * - User-specific recipe ownership via user_recipes table
 * - Fallback legacy URL pattern matching
 * - Comprehensive sync logging and error handling
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
    const { user_playlist_id, youtube_token } = JSON.parse(event.body)
    
    if (!user_playlist_id || !youtube_token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'user_playlist_id and youtube_token required' })
      }
    }

    console.log('🔄 Starting Phase 2.3 Smart Sync for playlist:', user_playlist_id)

    // Get playlist details
    const { data: playlist, error: playlistError } = await supabase
      .from('user_playlists')
      .select('*')
      .eq('id', user_playlist_id)
      .single()

    if (playlistError || !playlist) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Playlist not found', details: playlistError })
      }
    }

    // Start sync log
    const { data: syncLog } = await supabase
      .from('playlist_sync_logs')
      .insert([{
        user_id: playlist.user_id,
        playlist_id: user_playlist_id,
        youtube_playlist_id: playlist.youtube_playlist_id,
        status: 'running'
      }])
      .select()
      .single()

    // Fetch videos from YouTube API
    const videos = await fetchPlaylistVideos(playlist.youtube_playlist_id, youtube_token)
    
    let globalRecipesCreated = 0
    let userRecipesAdded = 0
    let alreadyInPlaylist = 0
    let errors = []

    console.log(`📹 Processing ${videos.length} videos from playlist: ${playlist.title}`)

    // Phase 2.3 Smart Sync Logic Implementation
    for (const [position, video] of videos.entries()) {
      try {
        // Step 1: Extract canonical youtube_video_id from API response
        const youtubeVideoId = video.snippet.resourceId.videoId
        const videoTitle = video.snippet.title
        const channelTitle = video.snippet.videoOwnerChannelTitle || 'Unknown Channel'
        
        if (!youtubeVideoId) {
          console.warn(`⚠️ No video ID found for video at position ${position}`)
          continue
        }

        console.log(`🔍 Processing: ${videoTitle} (${youtubeVideoId})`)

        // Step 2: Check for existing recipes by youtube_video_id (primary check)
        let { data: existingRecipe, error: recipeCheckError } = await supabase
          .from('recipes')
          .select('id, title, video_url')
          .eq('youtube_video_id', youtubeVideoId)
          .single()

        let recipeId

        if (existingRecipe && !recipeCheckError) {
          // Recipe exists globally
          recipeId = existingRecipe.id
          console.log(`✅ Found existing global recipe: ${existingRecipe.title}`)
        } else {
          // Step 3: Fallback check for existing recipes by video_url pattern (legacy data)
          const standardUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`
          
          const { data: legacyRecipe, error: legacyError } = await supabase
            .from('recipes')
            .select('id, title, video_url')
            .or(`video_url.eq.${standardUrl},video_url.like.%${youtubeVideoId}%`)
            .single()

          if (legacyRecipe && !legacyError) {
            // Found by URL pattern - update with canonical video_id
            recipeId = legacyRecipe.id
            await supabase
              .from('recipes')
              .update({ 
                youtube_video_id: youtubeVideoId,
                video_url: standardUrl // Standardize the URL
              })
              .eq('id', recipeId)
            console.log(`🔄 Updated legacy recipe with video_id: ${legacyRecipe.title}`)
          } else {
            // Step 4: Create new recipe in global table with canonical youtube_video_id
            const { data: newRecipe, error: recipeError } = await supabase
              .from('recipes')
              .insert([{
                youtube_video_id: youtubeVideoId,
                title: videoTitle,
                video_url: standardUrl,
                channel: channelTitle,
                sync_status: 'synced' // Ready for enrichment pipeline
              }])
              .select('id, title')
              .single()

            if (recipeError) {
              console.error(`❌ Error creating recipe for ${youtubeVideoId}:`, recipeError)
              errors.push({ video_id: youtubeVideoId, error: recipeError.message })
              continue
            }

            recipeId = newRecipe.id
            globalRecipesCreated++
            console.log(`🆕 Created new global recipe: ${newRecipe.title}`)
          }
        }

        // Step 5: Check if user has this recipe in THIS specific playlist
        const { data: existingUserRecipe, error: userRecipeCheckError } = await supabase
          .from('user_recipes')
          .select('id')
          .eq('user_id', playlist.user_id)
          .eq('recipe_id', recipeId)
          .eq('playlist_id', user_playlist_id)
          .single()

        if (existingUserRecipe && !userRecipeCheckError) {
          // User already has this recipe in this playlist
          alreadyInPlaylist++
          console.log(`⏭️  Recipe already in user's playlist`)
        } else {
          // Step 6: Create user_recipes entry linking user to recipe with playlist context
          const { error: userRecipeError } = await supabase
            .from('user_recipes')
            .insert([{
              user_id: playlist.user_id,
              recipe_id: recipeId,
              playlist_id: user_playlist_id,
              position_in_playlist: position,
              added_at: new Date().toISOString()
            }])

          if (userRecipeError) {
            console.error(`❌ Error adding recipe to user playlist:`, userRecipeError)
            errors.push({ video_id: youtubeVideoId, error: userRecipeError.message })
            continue
          }

          userRecipesAdded++
          console.log(`➕ Added recipe to user's playlist at position ${position}`)
        }

      } catch (videoError) {
        console.error(`❌ Error processing video at position ${position}:`, videoError)
        errors.push({ position, error: videoError.message })
      }
    }

    // Step 7: Update sync completion and metadata
    const syncCompleted = new Date().toISOString()
    
    await supabase
      .from('playlist_sync_logs')
      .update({
        sync_completed: syncCompleted,
        recipes_added: globalRecipesCreated,
        recipes_updated: userRecipesAdded,
        recipes_skipped: alreadyInPlaylist,
        errors: errors.length > 0 ? errors : null,
        status: errors.length === videos.length ? 'failed' : 'completed'
      })
      .eq('id', syncLog.id)

    // Update playlist sync status
    await supabase
      .from('user_playlists')
      .update({
        last_synced: syncCompleted,
        video_count: videos.length
      })
      .eq('id', user_playlist_id)

    const result = {
      success: true,
      playlist_name: playlist.title,
      total_videos: videos.length,
      global_recipes_created: globalRecipesCreated,
      user_recipes_added: userRecipesAdded,
      already_in_playlist: alreadyInPlaylist,
      errors_count: errors.length,
      sync_log_id: syncLog.id
    }

    console.log('✅ Phase 2.3 Smart Sync completed:', result)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    }

  } catch (error) {
    console.error('❌ Playlist sync failed:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Sync failed', 
        details: error.message,
        stack: error.stack
      })
    }
  }
}

async function fetchPlaylistVideos(playlistId, accessToken, maxResults = 50) {
  try {
    console.log(`🔍 Fetching videos for playlist: ${playlistId}`)
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?` +
      `part=snippet&playlistId=${playlistId}&maxResults=${maxResults}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`YouTube API error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    console.log(`📹 Found ${data.items?.length || 0} videos in playlist`)
    
    return data.items || []
  } catch (error) {
    console.error('❌ Error fetching playlist videos:', error)
    throw error
  }
}