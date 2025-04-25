// src/pages/HomePage.jsx

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  // State for loading and fetched recipes
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);

  useEffect(() => {
    async function fetchRecipes() {
      setLoading(true);

      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        console.log('✅ Sorted recipes:', data);
        setRecipes(data);
      }

      if (error) {
        console.error('❌ Fetch error:', error);
      }

      setLoading(false);
    }

    fetchRecipes();
  }, []);

  // Show "Loading..." while fetching
  if (loading) {
    return <p className="p-4 text-center">Loading…</p>;
  }

  // Show "No recipes yet" if none are found
  if (recipes.length === 0) {
    return <p className="p-4 text-center">No recipes yet.</p>;
  }

  // Main page content when recipes exist
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold mb-4">Saved Recipes</h1>

      {/* Map over each recipe and show a simple card */}
      {recipes.map((recipe) => (
        <div
          key={recipe.id}
          className="border p-4 rounded shadow hover:shadow-md transition"
        >
          <h2 className="text-lg font-semibold">{recipe.title}</h2>
          <p className="text-sm text-gray-600">Channel: {recipe.channel}</p>
          <button className="mt-3 bg-blue-500 text-white px-4 py-2 rounded">
            View Grocery List
          </button>
        </div>
      ))}
    </div>
  );
}