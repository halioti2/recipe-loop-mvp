import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'

export default function ProfilePage() {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const { user, signOut } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  const handleSignOut = async () => {
    setLoading(true)
    const { error } = await signOut()
    if (error) {
      setMessage(error.message)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Profile</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <p className="mt-1 text-sm text-gray-900">{user.email}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">User ID</label>
            <p className="mt-1 text-sm text-gray-500 font-mono">{user.id}</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Account Created</label>
            <p className="mt-1 text-sm text-gray-900">
              {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
          
          {user.user_metadata?.full_name && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Name</label>
              <p className="mt-1 text-sm text-gray-900">{user.user_metadata.full_name}</p>
            </div>
          )}
        </div>
        
        {message && (
          <div className="mt-4 text-sm text-red-600">{message}</div>
        )}
        
        <div className="mt-8">
          <button
            onClick={handleSignOut}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      </div>
    </div>
  )
}