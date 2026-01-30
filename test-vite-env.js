import { loadEnv } from 'vite';
import { createClient } from '@supabase/supabase-js';

// Test with Vite's loadEnv function
const env = loadEnv('development', process.cwd(), '');

console.log('=== VITE ENVIRONMENT TEST ===');
console.log('VITE_SUPABASE_URL from loadEnv:', env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY from loadEnv:', env.VITE_SUPABASE_ANON_KEY?.substring(0, 20) + '...');

// Also check process.env
console.log('\n=== PROCESS.ENV TEST ===');
console.log('VITE_SUPABASE_URL from process.env:', process.env.VITE_SUPABASE_URL);
console.log('VITE_SUPABASE_ANON_KEY from process.env:', process.env.VITE_SUPABASE_ANON_KEY?.substring(0, 20) + '...');

// Test connection
if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  
  try {
    const { data, error } = await client.from('recipes').select('id, title').limit(1);
    if (error) {
      console.error('Database error:', error);
    } else {
      console.log('\n=== CONNECTION SUCCESS ===');
      console.log('Connected to:', env.VITE_SUPABASE_URL);
      console.log('Sample data:', data);
    }
  } catch (err) {
    console.error('Connection failed:', err);
  }
} else {
  console.log('Environment variables not loaded properly');
}