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
      .select('expires_at, scopes')
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

    // 3. Check expiry
    const expiresAt = new Date(tokenRecord.expires_at)
    const now = new Date()

    if (expiresAt <= now) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ connected: false, error: 'token_expired' }),
      }
    }

    const expiresIn = Math.floor((expiresAt - now) / 1000)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        connected: true,
        expiresAt: tokenRecord.expires_at,
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
