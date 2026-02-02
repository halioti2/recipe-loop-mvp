import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Secure storage for provider tokens
class TokenStorage {
  static setProviderToken(userId, token, expiresAt) {
    const tokenData = {
      token,
      expiresAt: expiresAt || Date.now() + (3600 * 1000), // 1 hour default
      userId
    }
    localStorage.setItem(`provider_token_${userId}`, JSON.stringify(tokenData))
  }

  static getProviderToken(userId) {
    try {
      const stored = localStorage.getItem(`provider_token_${userId}`)
      if (!stored) return null

      const tokenData = JSON.parse(stored)
      
      // Check if token is expired
      if (Date.now() > tokenData.expiresAt) {
        localStorage.removeItem(`provider_token_${userId}`)
        return null
      }

      return tokenData.token
    } catch (error) {
      console.error('Error reading stored token:', error)
      return null
    }
  }

  static clearProviderToken(userId) {
    localStorage.removeItem(`provider_token_${userId}`)
  }

  static setRefreshToken(userId, refreshToken) {
    localStorage.setItem(`provider_refresh_token_${userId}`, refreshToken)
  }

  static getRefreshToken(userId) {
    return localStorage.getItem(`provider_refresh_token_${userId}`)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      
      // Store provider tokens if available (initial login)
      if (session?.user && session?.provider_token) {
        console.log('✅ Storing provider token from initial session')
        TokenStorage.setProviderToken(session.user.id, session.provider_token)
        
        if (session.provider_refresh_token) {
          TokenStorage.setRefreshToken(session.user.id, session.provider_refresh_token)
        }
      }
      
      setLoading(false)
    }
    
    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('Auth state changed:', event, session?.user?.id ? 'User signed in' : 'User signed out')
        }
        
        setUser(session?.user ?? null)
        
        // Handle provider token on fresh login
        if (event === 'SIGNED_IN' && session?.provider_token) {
          console.log('✅ Storing provider token from sign in event')
          TokenStorage.setProviderToken(session.user.id, session.provider_token)
          
          if (session.provider_refresh_token) {
            console.log('✅ Storing provider refresh token')
            TokenStorage.setRefreshToken(session.user.id, session.provider_refresh_token)
          }
        }
        
        // Clean up tokens on sign out
        if (event === 'SIGNED_OUT') {
          console.log('🧹 Cleaning up stored tokens')
          // We don't know the old user ID here, so clear all stored tokens
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('provider_token_') || key.startsWith('provider_refresh_token_')) {
              localStorage.removeItem(key)
            }
          })
        }
        
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])
  
  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin
      }
    })
    return { data, error }
  }
  
  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }
  
  const signOut = async () => {
    // Clear stored tokens before signing out
    if (user?.id) {
      TokenStorage.clearProviderToken(user.id)
    }
    
    const { error } = await supabase.auth.signOut()
    return { error }
  }
  
  const signInWithGoogle = async () => {
    // Dynamic redirect URL based on environment
    const redirectTo = window.location.origin;
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/youtube.readonly',
        queryParams: {
          access_type: 'offline',  // Request refresh token
          prompt: 'consent',       // Force consent screen
        },
        redirectTo: redirectTo
      }
    })
    return { data, error }
  }

  const hasYouTubeAccess = () => {
    // Check if user signed in with Google and has YouTube scope
    return user?.app_metadata?.provider === 'google'
  }

  const refreshGoogleToken = async (refreshToken) => {
    try {
      console.log('🔄 Attempting to refresh Google token...')
      
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.VITE_GOOGLE_CLIENT_ID, // You'll need this
          client_secret: process.env.VITE_GOOGLE_CLIENT_SECRET, // And this
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to refresh Google token')
      }

      const data = await response.json()
      
      // Store new access token
      const expiresAt = Date.now() + (data.expires_in * 1000)
      TokenStorage.setProviderToken(user.id, data.access_token, expiresAt)
      
      console.log('✅ Successfully refreshed Google token')
      return data.access_token
      
    } catch (error) {
      console.error('❌ Failed to refresh Google token:', error)
      return null
    }
  }

  const getYouTubeToken = async () => {
    if (!hasYouTubeAccess()) {
      console.log('❌ No YouTube access - user did not sign in with Google')
      return null
    }

    if (!user?.id) {
      console.log('❌ No user ID available')
      return null
    }
    
    // 1. Try stored token first
    const storedToken = TokenStorage.getProviderToken(user.id)
    if (storedToken) {
      console.log('✅ Found valid stored provider token')
      return storedToken
    }
    
    // 2. Try session token (immediate after login)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.provider_token) {
      console.log('✅ Found provider token in session')
      // Store it for future use
      TokenStorage.setProviderToken(user.id, session.provider_token)
      return session.provider_token
    }
    
    // 3. Try refreshing with Google directly
    const refreshToken = TokenStorage.getRefreshToken(user.id)
    if (refreshToken) {
      console.log('🔄 Attempting Google token refresh...')
      const newToken = await refreshGoogleToken(refreshToken)
      if (newToken) {
        return newToken
      }
    }
    
    // 4. Try Supabase session refresh (last resort)
    try {
      console.log('🔄 Attempting Supabase session refresh for YouTube token...')
      const { data: refreshedSession, error } = await supabase.auth.refreshSession()
      
      if (error) {
        console.error('❌ Session refresh failed:', error)
        return null
      }
      
      if (refreshedSession?.session?.provider_token) {
        console.log('✅ Got provider token from refreshed session')
        TokenStorage.setProviderToken(user.id, refreshedSession.session.provider_token)
        return refreshedSession.session.provider_token
      }
      
    } catch (refreshError) {
      console.error('❌ Error during session refresh:', refreshError)
    }
    
    console.warn('⚠️ No provider token available through any method')
    console.log('💡 User needs to re-authenticate with Google to restore YouTube access')
    return null
  }
  
  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signUp, 
      signIn, 
      signOut, 
      signInWithGoogle,
      hasYouTubeAccess,
      getYouTubeToken
    }}>
      {children}
    </AuthContext.Provider>
  )
}