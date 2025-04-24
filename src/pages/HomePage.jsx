// HomePage.jsx
import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  useEffect(() => {
    supabase.from('recipes').select('*').then(({ data, error }) =>
      console.log('Recipes fetched:', data, 'Error:', error)
    );
  }, []);

  return <h1 className="text-xl font-bold">Home – recipe list coming soon</h1>;
}