import React, { useEffect } from 'react';
import './App.css'
import { supabase } from './lib/supabaseClient';

function App() {
  useEffect(() => {
    supabase
      .from('recipes')
      .select('*')
      .then(({ data, error }) => {
        console.log('Recipes fetched:', data, 'Error:', error);
      });
  }, []);
  return (
    <h1 className="text-red-500 border-4 border-blue-500 p-4">
  Tailwind is working
</h1>
  );
}

export default App;
