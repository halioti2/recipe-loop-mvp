// Test script for the full workflow
import { supabase } from './src/lib/supabaseClient.js';

async function testSync() {
  console.log('🔁 Testing sync function...');
  
  try {
    const syncResponse = await fetch('/.netlify/functions/sync', {
      method: 'GET'
    });
    
    if (!syncResponse.ok) {
      console.error('❌ Sync failed:', syncResponse.status, syncResponse.statusText);
      return false;
    }
    
    const syncResult = await syncResponse.json();
    console.log('✅ Sync result:', syncResult);
    return true;
  } catch (error) {
    console.error('❌ Sync error:', error.message);
    return false;
  }
}

async function testEnrich() {
  console.log('🧠 Testing enrich function...');
  
  try {
    const enrichResponse = await fetch('/.netlify/functions/enrich', {
      method: 'GET'
    });
    
    if (!enrichResponse.ok) {
      console.error('❌ Enrich failed:', enrichResponse.status, enrichResponse.statusText);
      return false;
    }
    
    const enrichResult = await enrichResponse.json();
    console.log('✅ Enrich result:', enrichResult);
    return true;
  } catch (error) {
    console.error('❌ Enrich error:', error.message);
    return false;
  }
}

async function testDatabase() {
  console.log('🗄️ Testing database queries...');
  
  try {
    // Test recipes table
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('id, title, channel, video_url, ingredients')
      .limit(5);
    
    if (recipesError) {
      console.error('❌ Recipes query error:', recipesError.message);
      return false;
    }
    
    console.log(`✅ Found ${recipes.length} recipes in database`);
    
    if (recipes.length > 0) {
      console.log('📋 Sample recipe:', {
        title: recipes[0].title,
        channel: recipes[0].channel,
        hasIngredients: !!recipes[0].ingredients
      });
    }
    
    return true;
  } catch (error) {
    console.error('❌ Database test error:', error.message);
    return false;
  }
}

async function testGroceryList() {
  console.log('🛒 Testing grocery list functionality...');
  
  try {
    // Get a recipe with ingredients
    const { data: recipes, error: recipesError } = await supabase
      .from('recipes')
      .select('id, title, ingredients')
      .not('ingredients', 'is', null)
      .limit(1);
    
    if (recipesError || !recipes.length) {
      console.warn('⚠️ No recipes with ingredients found for grocery list test');
      return false;
    }
    
    const recipe = recipes[0];
    console.log(`📝 Testing with recipe: ${recipe.title}`);
    
    // Add to grocery list
    const { data: listInsert, error: insertError } = await supabase
      .from('lists')
      .insert([{
        recipe_id: recipe.id,
        ingredients: recipe.ingredients
      }])
      .select();

    if (insertError) {
      console.error('❌ Grocery list insert error:', insertError.message);
      return false;
    }
    
    const insertedListId = listInsert[0]?.id;
    console.log('✅ Successfully added recipe to grocery list');

    // Query grocery list
    const { data: lists, error: listsError } = await supabase
      .from('lists')
      .select(`
        id,
        ingredients,
        recipes(title)
      `)
      .order('created_at', { ascending: false })
      .limit(3);

    if (listsError) {
      console.error('❌ Grocery list query error:', listsError.message);
      // Still attempt cleanup even if query failed
      if (insertedListId) {
        await supabase.from('lists').delete().eq('id', insertedListId);
      }
      return false;
    }

    console.log(`✅ Found ${lists.length} items in grocery list`);
    lists.forEach(item => {
      console.log(`  - ${item.recipes?.title}: ${item.ingredients?.length || 0} ingredients`);
    });
    
    // Clean up - delete the test list item
    if (insertedListId) {
      const { error: deleteError } = await supabase
        .from('lists')
        .delete()
        .eq('id', insertedListId);
        
      if (deleteError) {
        console.error('❌ Failed to cleanup test list item:', deleteError.message);
        return false;
      }
      console.log('✅ Test list item cleaned up');
    }

    return true;
  } catch (error) {
    console.error('❌ Grocery list test error:', error.message);
    return false;
  }
}

async function runFullWorkflow() {
  console.log('🚀 Starting full workflow test...\n');
  
  let step = 1;
  
  // Step 1: Test database connection
  console.log(`\n${step++}. Testing database connection...`);
  const dbOk = await testDatabase();
  if (!dbOk) {
    console.log('\n❌ Workflow failed at database test');
    return;
  }
  
  // Step 2: Test sync (if functions are available locally)
  console.log(`\n${step++}. Testing sync function...`);
  // Note: This will fail locally since Netlify functions need to be deployed
  // We'll test the database directly instead
  
  // Step 3: Test enrich (if functions are available)
  console.log(`\n${step++}. Testing enrich function...`);
  // Note: This will also fail locally
  
  // Step 4: Test grocery list functionality
  console.log(`\n${step++}. Testing grocery list functionality...`);
  const groceryOk = await testGroceryList();
  
  // Summary
  console.log('\n📊 Workflow Test Summary:');
  console.log(`Database Connection: ${dbOk ? '✅' : '❌'}`);
  console.log(`Grocery List: ${groceryOk ? '✅' : '❌'}`);
  
  if (dbOk && groceryOk) {
    console.log('\n🎉 Core functionality is working!');
    console.log('\n💡 To test sync and enrich functions:');
    console.log('   1. Deploy to Netlify or run with Netlify CLI');
    console.log('   2. Use the frontend "Resync & Enrich" button');
  } else {
    console.log('\n❌ Some functionality needs attention');
  }
}

// Run the test
runFullWorkflow().catch(console.error);