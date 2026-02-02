/**
 * Optional: Secure Google Token Refresh Endpoint
 * 
 * This endpoint provides a more secure way to refresh Google OAuth tokens
 * by keeping the client secret on the server side only.
 * 
 * To use this approach:
 * 1. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your Netlify environment
 * 2. Update AuthContext to call this endpoint instead of direct Google API
 * 3. Remove VITE_GOOGLE_CLIENT_SECRET from frontend environment
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
    // Verify user is authenticated
    const authHeader = event.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing or invalid authorization header' })
      }
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid authentication token' })
      }
    }

    const { refresh_token } = JSON.parse(event.body)
    
    if (!refresh_token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'refresh_token is required' })
      }
    }

    console.log('🔄 Refreshing Google token for user:', user.id)

    // Refresh Google token server-side
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('❌ Google token refresh failed:', errorData)
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Failed to refresh Google token',
          details: errorData.error_description || errorData.error
        })
      }
    }

    const data = await response.json()
    
    console.log('✅ Successfully refreshed Google token')

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        access_token: data.access_token,
        expires_in: data.expires_in,
        // Don't return refresh_token unless Google provides a new one
        ...(data.refresh_token && { refresh_token: data.refresh_token })
      })
    }

  } catch (error) {
    console.error('❌ Token refresh endpoint error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error.message
      })
    }
  }
}

/* 
Usage in AuthContext:

const refreshGoogleToken = async (refreshToken) => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    const response = await fetch('/.netlify/functions/refresh-google-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to refresh token')
    }

    const data = await response.json()
    
    // Store new access token
    const expiresAt = Date.now() + (data.expires_in * 1000)
    TokenStorage.setProviderToken(user.id, data.access_token, expiresAt)
    
    // Store new refresh token if provided
    if (data.refresh_token) {
      TokenStorage.setRefreshToken(user.id, data.refresh_token)
    }
    
    return data.access_token
  } catch (error) {
    console.error('Failed to refresh token via backend:', error)
    return null
  }
}
*/