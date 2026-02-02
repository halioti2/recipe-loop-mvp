import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Navigation() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  
  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }
  
  const navLinks = [
    { path: '/', label: 'Recipes', icon: '🍽️' },
    { path: '/grocery-list', label: 'Grocery List', icon: '🛒' },
    { path: '/profile', label: 'Profile', icon: '👤' }
  ]
  
  return (
    <nav className="bg-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="text-xl font-bold text-gray-800">
              Recipe Loop
            </Link>
          </div>
          
          <div className="flex items-center space-x-4">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === link.path
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
                }`}
              >
                <span className="mr-1">{link.icon}</span>
                {link.label}
              </Link>
            ))}
            
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                {user?.email}
              </span>
              <button
                onClick={handleSignOut}
                className="px-3 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}