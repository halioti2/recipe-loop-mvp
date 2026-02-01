/*
 * Recipe Loop MVP - Main Application Component
 * Testing CodeRabbit analysis capability
 * YouTube recipe aggregation with AI-powered ingredient extraction
 */
import { Routes, Route } from 'react-router-dom';
import RootLayout from './src/layouts/RootLayout';
import HomePage from './src/pages/HomePage.jsx';
import RecipePage from './src/pages/RecipePage.jsx';
import ListPage from './src/pages/ListPage.jsx';

export default function App() {
  return (
    <RootLayout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/recipe/:id" element={<RecipePage />} />
        <Route path="/list" element={<ListPage />} />
      </Routes>
    </RootLayout>
  );
}