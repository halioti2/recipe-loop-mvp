import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

/**
 * Refreshes an expired YouTube access token using the stored refresh token.
 * Updates the database with the new access_token, expires_at, and last_refreshed_at.
 *
 * @param {string} userId - Supabase user UUID
 * @returns {Promise<{ access_token: string, expires_at: string }>}
 * @throws if no token found, no refresh_token, Google rejects refresh, or DB update fails
 */
export async function refreshYouTubeToken(userId) {
  // 1. Fetch current token from DB
  const { data: tokenRecord, error: fetchError } = await supabase
    .from('user_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'youtube')
    .single()

  if (fetchError || !tokenRecord) {
    throw new Error('No YouTube token found for user')
  }

  if (!tokenRecord.refresh_token) {
    throw new Error('No refresh token available - user must reconnect YouTube')
  }

  // 2. Exchange refresh token for new access token via Google
  console.log('🔄 Refreshing YouTube access token for user:', userId)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRecord.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    console.error('❌ Google token refresh failed:', errorData)
    throw new Error(`Token refresh failed: ${errorData.error_description || errorData.error}`)
  }

  const tokenData = await response.json()
  const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

  // 3. Update DB with new access_token, expires_at, and last_refreshed_at
  const { error: updateError } = await supabase
    .from('user_oauth_tokens')
    .update({
      access_token: tokenData.access_token,
      expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      // Google occasionally issues a new refresh token - store it if provided
      ...(tokenData.refresh_token && { refresh_token: tokenData.refresh_token }),
    })
    .eq('user_id', userId)
    .eq('provider', 'youtube')

  if (updateError) {
    throw new Error(`Failed to update token in database: ${updateError.message}`)
  }

  console.log('✅ YouTube token refreshed successfully for user:', userId)

  return {
    access_token: tokenData.access_token,
    expires_at: expiresAt,
  }
}
