/**
 * FRONTEND DATABASE CONNECTION TEST
 * 
 * This test verifies that the frontend can connect to Supabase and retrieve data
 * using the correct column names and environment variables.
 * 
 * HOW TO RUN:
 * NODE_ENV=development node -r dotenv/config test-frontend-db.js
 * 
 * REQUIREMENTS:
 * - .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * - Active Supabase database with recipes table
 * 
 * WHAT IT TESTS:
 * - Environment variable loading
 * - Supabase client creation
 * - Database connection
 * - Column name correctness (channel vs channel_name)
 * - Data retrieval and formatting
 */

// Test what database the frontend is actually connecting to
console.log('=== TESTING FRONTEND DATABASE CONNECTION ===');

// Load environment variables
console.log('Environment variables:');
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL);

// Import and test the client
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

// Validate environment variables before creating client
if (!supabaseUrl) {
  console.error('❌ Missing VITE_SUPABASE_URL environment variable');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('❌ Missing VITE_SUPABASE_ANON_KEY environment variable');
  process.exit(1);
}

console.log('Creating client with:');
console.log('URL:', supabaseUrl);
console.log('Key:', supabaseKey?.substring(0, 30) + '...');

const client = createClient(supabaseUrl, supabaseKey);

// Test connection and see what data we get
try {
  const { data: recipes, error } = await client
    .from('recipes')
    .select('id, title, created_at, channel')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Database error:', error);
    process.exit(1);
  }

  console.log('=== RECIPES FOUND ===');
  recipes.forEach((recipe, index) => {
    console.log(`${index + 1}. ${recipe.title} (${recipe.channel})`);
    console.log(`   Created: ${recipe.created_at}`);
    console.log(`   ID: ${recipe.id}`);
    console.log('');
  });

  // Verify which database this is by checking the URL structure
  const urlParts = supabaseUrl.split('.');
  const projectId = urlParts[0].replace('https://', '');
  console.log('=== DATABASE IDENTITY ===');
  console.log('Project ID:', projectId);
  console.log('Full URL:', supabaseUrl);
  
} catch (err) {
  console.error('Connection test failed:', err);
  process.exit(1);
}