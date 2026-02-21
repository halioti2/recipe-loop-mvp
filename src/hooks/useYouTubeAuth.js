import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function useYouTubeAuth() {
  const { user } = useAuth()
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null) // 'no_token' | 'token_expired' | null
  const [expiresAt, setExpiresAt] = useState(null)
  const [expiresIn, setExpiresIn] = useState(null)

  const checkConnection = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setConnected(false)
        setError('no_token')
        return
      }

      const response = await fetch('/.netlify/functions/auth-youtube-status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!response.ok) {
        setConnected(false)
        setError('no_token')
        return
      }

      const data = await response.json()
      setConnected(data.connected)
      setError(data.error || null)
      setExpiresAt(data.expiresAt || null)
      setExpiresIn(data.expiresIn || null)
    } catch (err) {
      console.error('❌ YouTube connection check failed:', err)
      setConnected(false)
      setError('no_token')
    } finally {
      setLoading(false)
    }
  }, [user])

  // Auto-check on mount and when user changes
  useEffect(() => {
    checkConnection()
  }, [checkConnection])

  /**
   * Initiates the YouTube OAuth flow by redirecting to Google.
   * After Google grants access, the callback stores the token and
   * redirects back to /playlist-discovery?connected=true.
   */
  const connectYouTube = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      console.error('❌ No session - cannot initiate YouTube OAuth')
      return
    }

    const response = await fetch('/.netlify/functions/auth-youtube-init', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (!response.ok) {
      console.error('❌ Failed to get OAuth URL')
      return
    }

    const { url } = await response.json()
    window.location.href = url
  }

  /**
   * Removes the YouTube token from the database and updates connection state.
   */
  const disconnectYouTube = async () => {
    if (!user) return

    await supabase
      .from('user_oauth_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'youtube')

    await checkConnection()
  }

  /**
   * Returns the current YouTube access token directly from the DB for use
   * in frontend YouTube API calls (e.g. listing playlists, channel info).
   * Returns null if not connected or token is expired.
   * Does NOT auto-refresh — server-side sync handles refresh automatically.
   */
  const getAccessToken = async () => {
    if (!user) return null

    const { data } = await supabase
      .from('user_oauth_tokens')
      .select('access_token, expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'youtube')
      .single()

    if (!data) return null

    const expired = new Date(data.expires_at) <= new Date()
    if (expired) return null

    return data.access_token
  }

  return {
    connected,
    loading,
    error,
    expiresAt,
    expiresIn,
    checkConnection,
    connectYouTube,
    disconnectYouTube,
    getAccessToken,
  }
}
