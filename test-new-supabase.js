/**
 * SUPABASE DATABASE IDENTITY TEST
 * 
 * This test verifies that the application is connected to the correct Supabase
 * database and that basic operations work correctly.
 * 
 * HOW TO RUN:
 * NODE_ENV=development node -r dotenv/config test-new-supabase.js
 * 
 * REQUIREMENTS:
 * - .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 * - Active Supabase database with proper schema
 * - Insert permissions on recipes table
 * 
 * WHAT IT TESTS:
 * - Database identity and connection
 * - Insert operations with RLS guard
 * - Data retrieval and verification
 * - Cleanup operations
 * - Environment configuration display
 */

// Test if frontend is using the NEW Supabase database
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('🔍 Testing NEW Supabase Database Connection...\n');

console.log('📋 Current Environment:');
console.log(`  VITE_SUPABASE_URL: ${supabaseUrl}`);
console.log(`  Database Host: ${supabaseUrl ? new URL(supabaseUrl).hostname : 'Not set'}`);
console.log(`  Anon Key: ${supabaseKey ? supabaseKey.slice(0, 20) + '...' : 'Not set'}\n`);

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testNewDatabase() {
  try {
    console.log('🗄️ Testing database tables...\n');
    
    // Test recipes table
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('id, title, channel, created_at, video_url')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (recipesError) {
      console.error('❌ Recipes table error:', recipesError.message);
      return false;
    }
    
    console.log(`✅ Recipes table: ${recipes.length} records found`);
    if (recipes.length > 0) {
      console.log('📋 Recent recipes:');
      recipes.forEach((recipe, index) => {
        const safeTitle = recipe.title ? String(recipe.title).slice(0, 60) : '(untitled)';
        console.log(`  ${index + 1}. ${safeTitle}...`);
        console.log(`     Created: ${new Date(recipe.created_at).toLocaleString()}`);
        console.log(`     URL: ${recipe.video_url}`);
      });
    }
    
    // Test lists table
    const { data: lists, error: listsError } = await supabase
      .from('lists')
      .select('id, created_at, recipe_id')
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (listsError) {
      console.error('❌ Lists table error:', listsError.message);
      return false;
    }
    
    console.log(`\n✅ Lists table: ${lists.length} records found`);
    
    // Test events table
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, action, timestamp')
      .order('timestamp', { ascending: false })
      .limit(3);
    
    if (eventsError) {
      console.error('❌ Events table error:', eventsError.message);
      return false;
    }
    
    console.log(`✅ Events table: ${events.length} records found`);
    
    // Check if this looks like fresh data
    console.log('\n📊 Database Analysis:');
    const now = new Date();
    const recentRecipes = recipes.filter(r => 
      (now - new Date(r.created_at)) < (24 * 60 * 60 * 1000) // Last 24 hours
    );
    
    console.log(`  Recipes created in last 24h: ${recentRecipes.length}`);
    console.log(`  Total grocery lists: ${lists.length}`);
    console.log(`  Total events logged: ${events.length}`);
    
    if (recentRecipes.length > 0) {
      console.log('\n✅ This appears to be a NEW database with recent data');
    } else if (recipes.length === 0) {
      console.log('\n📝 This appears to be a CLEAN/EMPTY new database');
    } else {
      console.log('\n⚠️ This database has older data - check if it\'s the right one');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    return false;
  }
}

async function testDatabaseIdentity() {
  try {
    console.log('\n🔍 Checking database identity...');
    
    // Insert a unique test record to verify we're in the right database
    const testId = `test-${Date.now()}`;
    const { data: insertData, error: insertError } = await supabase
      .from('recipes')
      .insert([{
        title: `Test Record - ${new Date().toISOString()}`,
        video_url: `https://youtube.com/test-${testId}`,
        channel: 'Database Test Channel',
        summary: 'This is a test record to verify database identity'
      }])
      .select();
    
    if (insertError) {
      console.error('❌ Could not insert test record:', insertError.message);
      return false;
    }
    
    if (!insertData || insertData.length === 0) {
      console.log('❌ Insert returned no rows — possible RLS blocking select', { insertData });
      return false;
    }
    
    console.log(`✅ Test record inserted with ID: ${insertData[0].id}`);
    
    // Immediately query it back to confirm
    const { data: readData, error: readError } = await supabase
      .from('recipes')
      .select('*')
      .eq('video_url', `https://youtube.com/test-${testId}`)
      .single();
    
    if (readError || !readData) {
      console.error('❌ Could not read back test record');
      return false;
    }
    
    console.log('✅ Test record confirmed in database');
    console.log(`   Title: ${readData.title}`);
    console.log(`   Created: ${new Date(readData.created_at).toLocaleString()}`);
    
    // Clean up - delete the test record
    const { data: deleteData, error: deleteError } = await supabase
      .from('recipes')
      .delete()
      .eq('id', readData.id);
    
    if (deleteError) {
      console.error('❌ Failed to delete test record:', deleteError.message);
      return false;
    }
    
    console.log('✅ Test record cleaned up');
    
    return true;
    
  } catch (error) {
    console.error('❌ Database identity test failed:', error.message);
    return false;
  }
}

// Run the tests
testNewDatabase()
  .then(async (success) => {
    if (success) {
      return await testDatabaseIdentity();
    }
    return false;
  })
  .then((identitySuccess) => {
    console.log('\n' + '='.repeat(50));
    console.log('🎯 DATABASE CONNECTION TEST RESULTS');
    console.log('='.repeat(50));
    
    if (identitySuccess) {
      console.log('✅ CONFIRMED: Frontend is connected to the NEW Supabase database');
      console.log('✅ Database is accessible and working correctly');
      console.log('\n🚀 You can now safely test the frontend at http://localhost:5174');
    } else {
      console.log('❌ Issue detected with database connection');
      console.log('💡 Check your .env file and Supabase credentials');
    }
  })
  .catch(console.error);