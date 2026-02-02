/*
 * Recipe Loop MVP - Main Application Component
 * Multi-user authentication with protected routing
 * YouTube recipe aggregation with AI-powered ingredient extraction
 */
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './src/contexts/AuthContext';
import ProtectedRoute from './src/components/ProtectedRoute';
import Navigation from './src/components/Navigation';
import LoginPage from './src/components/LoginPage';
import ProfilePage from './src/components/ProfilePage';
import GroceryListPage from './src/components/GroceryListPage';
import HomePage from './src/pages/HomePageTest.jsx';
import RecipePage from './src/pages/RecipePage.jsx';
import ListPage from './src/pages/ListPage.jsx';

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50">
          <Navigation />
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