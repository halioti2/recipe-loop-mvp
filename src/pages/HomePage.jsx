// src/pages/HomePage.jsx

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  // Set up loading and recipes state
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]); // ⬅️ New: Store fetched recipes

  useEffect(() => {
    async function fetchRecipes() {
      setLoading(true);

      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        console.log('✅ Sorted recipes:', data);
        setRecipes(data); // ⬅️ Save fetched recipes into state
      }

      if (error) {
        console.error('❌ Fetch error:', error);
      }

      setLoading(false);
    }

    fetchRecipes();
  }, []);

  // If loading, show a loading message
  if (loading) {
    return <p className="p-4 text-center">Loading…</p>;
  }

  // If there are no recipes, show a "No recipes yet" message
  if (recipes.length === 0) {
    return <p className="p-4 text-center">No recipes yet.</p>;
  }

  // Main page content if recipes exist
  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Home Page</h1>
      {/* Later we'll map over recipes here */}
    </div>
  );
}
