import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers }
  }

  try {
    // 1. Validate user JWT
    const authHeader = event.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing authorization header' }),
      }
    }

    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt)

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid authentication token' }),
      }
    }

    // 2. Query user_oauth_tokens for YouTube token
    const { data: tokenRecord, error: dbError } = await supabase
      .from('user_oauth_tokens')
      .select('expires_at, scopes, refresh_token')
      .eq('user_id', user.id)
      .eq('provider', 'youtube')
      .single()

    if (dbError || !tokenRecord) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ connected: false, error: 'no_token' }),
      }
    }

    // 3. Check expiry — attempt refresh if expired and refresh_token exists
    const now = new Date()
    let expiresAt = new Date(tokenRecord.expires_at)

    if (expiresAt <= now) {
      if (!tokenRecord.refresh_token) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ connected: false, error: 'token_expired' }),
        }
      }

      // Refresh the access token
      console.log('🔄 Access token expired, refreshing for user:', user.id)
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: tokenRecord.refresh_token,
          grant_type: 'refresh_token',
        }),
      })

      if (!refreshResponse.ok) {
        console.error('❌ Token refresh failed:', await refreshResponse.text())
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ connected: false, error: 'token_expired' }),
        }
      }

      const refreshData = await refreshResponse.json()
      expiresAt = new Date(Date.now() + refreshData.expires_in * 1000)

      await supabase
        .from('user_oauth_tokens')
        .update({
          access_token: refreshData.access_token,
          expires_at: expiresAt.toISOString(),
          ...(refreshData.refresh_token && { refresh_token: refreshData.refresh_token }),
        })
        .eq('user_id', user.id)
        .eq('provider', 'youtube')

      console.log('✅ Token refreshed successfully for user:', user.id)
    }

    const expiresIn = Math.floor((expiresAt - now) / 1000)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        connected: true,
        expiresAt: expiresAt.toISOString(),
        expiresIn,
        scope: tokenRecord.scopes?.join(' ') || null,
      }),
    }
  } catch (error) {
    console.error('❌ auth-youtube-status error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    }
  }
}
