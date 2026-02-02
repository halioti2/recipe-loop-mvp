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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
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
        redirectTo: redirectTo
      }
    })
    return { data, error }
  }

  const hasYouTubeAccess = () => {
    // Check if user signed in with Google and has YouTube scope
    return user?.app_metadata?.provider === 'google'
  }

  const getYouTubeToken = async () => {
    if (!hasYouTubeAccess()) return null
    
    const { data: { session } } = await supabase.auth.getSession()
    
    // IMPORTANT: provider_token is only available immediately after OAuth callback
    // and is not persisted across browser refreshes. For production apps, you should:
    // 1. Capture provider_token in an Edge Function during OAuth callback
    // 2. Store it securely server-side with refresh capability
    // 3. Implement token refresh logic against Google's OAuth endpoint
    // This current implementation will return null after page refresh
    return session?.provider_token || null
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