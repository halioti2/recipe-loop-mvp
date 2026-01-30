// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const getEnv = () => {
  // Check if we're in a Node.js environment (Netlify Functions)
  const isNode = typeof process !== 'undefined' && process.env && typeof window === 'undefined';
  
  if (isNode) {
    console.log('Using process.env for Supabase config (Node environment)');
    return {
      url: process.env.VITE_SUPABASE_URL,
      key: process.env.VITE_SUPABASE_ANON_KEY,
    };
  }
  
  // Browser environment - use import.meta.env
  console.log('Using import.meta.env for Supabase config (Browser environment)');
  
  // Check if import.meta is available before using it
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return {
      url: import.meta.env.VITE_SUPABASE_URL,
      key: import.meta.env.VITE_SUPABASE_ANON_KEY,
    };
  }
  
  // Fallback: try process.env anyway (for cases where import.meta isn't available)
  console.log('Fallback: Using process.env (import.meta not available)');
  return {
    url: process.env.VITE_SUPABASE_URL,
    key: process.env.VITE_SUPABASE_ANON_KEY,
  };
};

const { url: supabaseUrl, key: supabaseKey } = getEnv();

// Add debug logging to see what values are actually being used
console.log('=== SUPABASE CLIENT DEBUG ===');
console.log('Supabase URL being used:', supabaseUrl);
console.log('Supabase Key being used:', supabaseKey?.substring(0, 20) + '...');
console.log('Environment type:', typeof process !== 'undefined' ? 'Node' : 'Browser');

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key is missing. Check environment variables.');
  // Optionally throw an error or handle appropriately
}

export const supabase = createClient(supabaseUrl, supabaseKey);
