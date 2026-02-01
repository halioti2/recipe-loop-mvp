// Debug script to check what environment variables are available to Vite frontend
console.log('=== FRONTEND ENVIRONMENT DEBUG ===');

// Store original values before creating client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('VITE_SUPABASE_URL:', supabaseUrl);
console.log('VITE_SUPABASE_ANON_KEY:', supabaseKey?.substring(0, 20) + '...');

// Test the supabase client directly
import { supabase } from './src/lib/supabaseClient.js';

console.log('Supabase client URL:', supabaseUrl);
console.log('Supabase client Key:', supabaseKey?.substring(0, 20) + '...');

// Test actual connection
try {
  const { data, error } = await supabase.from('recipes').select('id, title, created_at').limit(1);
  if (error) {
    console.error('Database connection error:', error);
  } else {
    console.log('Successfully connected to database');
    console.log('Sample recipe data:', data);
  }
} catch (err) {
  console.error('Failed to test database:', err);
}