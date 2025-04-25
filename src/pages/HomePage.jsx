// src/pages/HomePage.jsx
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  useEffect(() => {
    async function fetchRecipes() {
      const { data, error } = await supabase
        .from('recipes')
        .select('*');
  
      // Only log data if it worked
      if (data) {
        console.log('✅ Fetched recipes:', data);
      }
  
      // Only log error if it exists
      if (error) {
        console.error('❌ Fetch error:', error);
      }
    }
  
    fetchRecipes();
  }, []);

  return <h1 className="text-xl font-bold p-4">Home Page</h1>;
}