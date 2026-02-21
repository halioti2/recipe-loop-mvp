import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler(event, context) {
  const appUrl = process.env.URL || 'http://localhost:8888'
  const { code, state, error: oauthError } = event.queryStringParameters || {}

  // 1. Handle OAuth denial by user
  if (oauthError) {
    console.log('⚠️ YouTube OAuth denied by user:', oauthError)
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/playlist-discovery?error=access_denied` },
    }
  }

  if (!code || !state) {
    console.error('❌ Missing code or state in OAuth callback')
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/playlist-discovery?error=invalid_state` },
    }
  }

  // 2. Validate state parameter (CSRF + timestamp check)
  let stateData
  try {
    stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'))
  } catch {
    console.error('❌ Could not parse state parameter')
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/playlist-discovery?error=invalid_state` },
    }
  }

  const { userId, timestamp } = stateData
  const tenMinutes = 10 * 60 * 1000

  if (!userId || !timestamp || Date.now() - timestamp > tenMinutes) {
    console.error('❌ State expired or missing userId')
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/playlist-discovery?error=invalid_state` },
    }
  }

  // 3. Exchange authorization code for tokens
  const redirectUri = `${appUrl}/.netlify/functions/auth-youtube-callback`
  let tokenData

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      console.error('❌ Token exchange failed:', err)
      return {
        statusCode: 302,
        headers: { Location: `${appUrl}/playlist-discovery?error=token_exchange_failed` },
      }
    }

    tokenData = await response.json()
  } catch (error) {
    console.error('❌ Token exchange network error:', error)
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/playlist-discovery?error=token_exchange_failed` },
    }
  }

  // 4. Calculate expires_at and upsert token to DB
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  const { error: upsertError } = await supabase
    .from('user_oauth_tokens')
    .upsert(
      {
        user_id: userId,
        provider: 'youtube',
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        token_type: tokenData.token_type || 'Bearer',
        expires_at: expiresAt,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      },
      { onConflict: 'user_id,provider' }
    )

  if (upsertError) {
    console.error('❌ Failed to store YouTube token:', upsertError)
    return {
      statusCode: 302,
      headers: { Location: `${appUrl}/playlist-discovery?error=token_exchange_failed` },
    }
  }

  console.log('✅ YouTube token stored successfully for user:', userId)

  // 5. Redirect to success
  return {
    statusCode: 302,
    headers: { Location: `${appUrl}/playlist-discovery?connected=true` },
  }
}
