/*
 * Recipe Loop MVP - Main Application Component
 * Multi-user authentication with protected routing
 * YouTube recipe aggregation with AI-powered ingredient extraction
 */
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import ProtectedRoute from './src/components/ProtectedRoute';
import Navigation from './src/components/Navigation';
import LoginPage from './src/components/LoginPage';
import ProfilePage from './src/components/ProfilePage';
import GroceryListPage from './src/components/GroceryListPage';
import HomePage from './src/pages/HomePageTest.jsx';
import RecipePage from './src/pages/RecipePage.jsx';
import ListPage from './src/pages/ListPage.jsx';

// Conditional Navigation component that only shows when user is authenticated
function ConditionalNavigation() {
  const { user } = useAuth();
  return user ? <Navigation /> : null;
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <ConditionalNavigation />
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            
            {/* Protected routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            } />
            <Route path="/recipe/:id" element={
              <ProtectedRoute>
                <RecipePage />
              </ProtectedRoute>
            } />
            <Route path="/list" element={
              <ProtectedRoute>
                <ListPage />
              </ProtectedRoute>
            } />
            <Route path="/lists" element={
              <ProtectedRoute>
                <GroceryListPage />
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </AuthProvider>
    </Router>
  );
}