import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers }
  }

  try {
    console.log('🔍 Checking user playlists...')
    
    // Get all user playlists
    const { data: playlists, error } = await supabase
      .from('user_playlists')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database error', details: error })
      }
    }

    console.log(`📊 Found ${playlists?.length || 0} user playlists`)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        total_playlists: playlists?.length || 0,
        playlists: playlists || [],
        message: playlists?.length > 0 
          ? 'Found user playlists - you can now test sync with these IDs'
          : 'No user playlists found - connect a playlist first in the UI'
      })
    }

  } catch (error) {
    console.error('❌ Debug endpoint error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal error', details: error.message })
    }
  }
}