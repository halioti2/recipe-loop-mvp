// Simple Node.js test for the workflow
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('VITE_SUPABASE_URL:', supabaseUrl ? 'Present' : 'Missing');
  console.log('VITE_SUPABASE_ANON_KEY:', supabaseKey ? 'Present' : 'Missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabaseSchema() {
  console.log('🗄️ Testing database schema...');
  
  try {
    // Test if tables exist by trying to query them
    const tables = ['recipes', 'lists', 'events'];
    const results = {};
    
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1);
        
        if (error) {
          results[table] = `❌ Error: ${error.message}`;
        } else {
          results[table] = `✅ Table exists (${data.length} sample records)`;
        }
      } catch (err) {
        results[table] = `❌ Exception: ${err.message}`;
      }
    }
    
    console.log('📋 Table Status:');
    Object.entries(results).forEach(([table, status]) => {
      console.log(`  ${table}: ${status}`);
    });
    
    return Object.values(results).every(status => status.startsWith('✅'));
  } catch (error) {
    console.error('❌ Schema test error:', error.message);
    return false;
  }
}

async function testInsertRecipe() {
  console.log('\n📝 Testing recipe insertion...');
  
  try {
    // Insert a test recipe
    const testRecipe = {
      title: 'Test Recipe - Chocolate Cookies',
      video_url: `https://www.youtube.com/watch?v=test-${Date.now()}`,
      channel: 'Test Channel',
      summary: 'A test recipe for workflow verification',
      ingredients: ['1 cup flour', '2 eggs', '1 cup sugar'],
      playlist_id: 'test-playlist'
    };
    
    const { data, error } = await supabase
      .from('recipes')
      .insert([testRecipe])
      .select();
    
    if (error) {
      console.error('❌ Recipe insert error:', error.message);
      return null;
    }
    
    console.log('✅ Successfully inserted test recipe:', data[0].title);
    return data[0];
  } catch (error) {
    console.error('❌ Recipe insert exception:', error.message);
    return null;
  }
}

async function testGroceryListWorkflow(recipe) {
  console.log('\n🛒 Testing grocery list workflow...');
  
  if (!recipe) {
    console.log('⏭️ Skipping grocery list test (no recipe available)');
    return false;
  }
  
  try {
    // Add recipe to grocery list
    const { data: listData, error: listError } = await supabase
      .from('lists')
      .insert([{
        recipe_id: recipe.id,
        ingredients: recipe.ingredients
      }])
      .select();
    
    if (listError) {
      console.error('❌ Grocery list insert error:', listError.message);
      return false;
    }
    
    console.log('✅ Added recipe to grocery list');
    
    // Log an event
    const { error: eventError } = await supabase
      .from('events')
      .insert([{
        action: 'add_to_grocery_list',
        recipe_id: recipe.id
      }]);
    
    if (eventError) {
      console.error('⚠️ Event logging failed:', eventError.message);
    } else {
      console.log('✅ Event logged successfully');
    }
    
    // Query the grocery list
    const { data: lists, error: queryError } = await supabase
      .from('lists')
      .select(`
        id,
        ingredients,
        created_at,
        recipes(title, channel)
      `)
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (queryError) {
      console.error('❌ Grocery list query error:', queryError.message);
      return false;
    }
    
    console.log(`✅ Grocery list contains ${lists.length} items:`);
    lists.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.recipes?.title} (${item.ingredients?.length} ingredients)`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Grocery list workflow error:', error.message);
    return false;
  }
}

async function testDataRelationships() {
  console.log('\n🔗 Testing data relationships...');
  
  try {
    // Test foreign key relationships
    const { data, error } = await supabase
      .from('lists')
      .select(`
        id,
        recipe_id,
        recipes(title, channel, video_url)
      `)
      .limit(3);
    
    if (error) {
      console.error('❌ Relationship query error:', error.message);
      return false;
    }
    
    console.log('✅ Foreign key relationships working:');
    data.forEach(item => {
      console.log(`  List item → Recipe: ${item.recipes?.title}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Relationship test error:', error.message);
    return false;
  }
}

async function runWorkflowTest() {
  console.log('🚀 Starting database workflow test...\n');
  
  // Test 1: Database schema
  const schemaOk = await testDatabaseSchema();
  
  if (!schemaOk) {
    console.log('\n❌ Database schema is not ready. Please run database_schema.sql first.');
    console.log('\n📄 Steps to fix:');
    console.log('1. Go to your Supabase project dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the contents of database_schema.sql');
    console.log('4. Run the SQL to create tables');
    return;
  }
  
  // Test 2: Insert test data
  const testRecipe = await testInsertRecipe();
  
  // Test 3: Grocery list workflow
  const groceryOk = await testGroceryListWorkflow(testRecipe);
  
  // Test 4: Data relationships
  const relationshipsOk = await testDataRelationships();
  
  // Summary
  console.log('\n📊 Workflow Test Results:');
  console.log(`Database Schema: ${schemaOk ? '✅' : '❌'}`);
  console.log(`Recipe Insertion: ${testRecipe ? '✅' : '❌'}`);
  console.log(`Grocery List: ${groceryOk ? '✅' : '❌'}`);
  console.log(`Relationships: ${relationshipsOk ? '✅' : '❌'}`);
  
  if (schemaOk && testRecipe && groceryOk && relationshipsOk) {
    console.log('\n🎉 Full workflow test PASSED!');
    console.log('\n✅ Your database is ready for:');
    console.log('   • Recipe syncing from YouTube');
    console.log('   • AI ingredient enrichment');
    console.log('   • Grocery list functionality');
    console.log('   • Event tracking');
  } else {
    console.log('\n⚠️ Some tests failed - check the errors above');
  }
}

runWorkflowTest().catch(console.error);