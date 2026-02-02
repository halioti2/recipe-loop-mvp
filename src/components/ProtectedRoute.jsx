import { useAuth } from '../contexts/AuthContext'
import { Navigate, useLocation } from 'react-router-dom'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    )
  }
  
  if (!user) {
    // Redirect to login with return path
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  
  return children
}