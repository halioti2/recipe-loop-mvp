// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const getEnv = () => {
  // In Netlify Functions (Node) use process.env
  // Important: Ensure these variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) 
  // are also set in your Netlify project's environment variables.
  if (typeof process !== 'undefined' && process.env.VITE_SUPABASE_URL) {
    console.log('Using process.env for Supabase config (Node environment)');
    return {
      url: process.env.VITE_SUPABASE_URL,
      key: process.env.VITE_SUPABASE_ANON_KEY,
    };
  }
  // In the browser Vite already injects import.meta.env
  console.log('Using import.meta.env for Supabase config (Browser environment)');
  return {
    url: import.meta.env.VITE_SUPABASE_URL,
    key: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
};

const { url: supabaseUrl, key: supabaseKey } = getEnv();

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key is missing. Check environment variables.');
  // Optionally throw an error or handle appropriately
}

export const supabase = createClient(supabaseUrl, supabaseKey);
