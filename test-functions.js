// Test the sync and enrich functions directly
import { handler as syncHandler } from './netlify/functions/sync.js';
import { handler as enrichHandler } from './netlify/functions/enrich.js';

async function testSyncFunction() {
  console.log('🔁 Testing sync function...');
  
  try {
    const result = await syncHandler(
      { httpMethod: 'GET' }, 
      {}
    );
    
    console.log('Sync Status:', result.statusCode);
    
    if (result.statusCode === 200) {
      const response = JSON.parse(result.body);
      console.log('✅ Sync Result:', response);
      return response.added || 0;
    } else {
      console.error('❌ Sync Failed:', result.body);
      return 0;
    }
  } catch (error) {
    console.error('❌ Sync Error:', error.message);
    return 0;
  }
}

async function testEnrichFunction() {
  console.log('\n🧠 Testing enrich function...');
  
  try {
    const result = await enrichHandler(
      { httpMethod: 'GET' },
      {}
    );
    
    console.log('Enrich Status:', result.statusCode);
    
    if (result.statusCode === 200) {
      const response = JSON.parse(result.body);
      console.log('✅ Enrich Result:', response);
      return response.updated || 0;
    } else {
      console.error('❌ Enrich Failed:', result.body);
      return 0;
    }
  } catch (error) {
    console.error('❌ Enrich Error:', error.message);
    return 0;
  }
}

async function checkRecipesInDatabase() {
  console.log('\n📊 Checking recipes in database...');
  
  // Import supabase client
  const { createClient } = await import('@supabase/supabase-js');
  
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY
  );
  
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, channel, ingredients, created_at')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) {
    console.error('❌ Database query error:', error.message);
    return;
  }
  
  console.log(`✅ Found ${recipes.length} recipes in database:`);
  recipes.forEach((recipe, index) => {
    const hasIngredients = recipe.ingredients && recipe.ingredients.length > 0;
    console.log(`  ${index + 1}. ${recipe.title}`);
    console.log(`     Channel: ${recipe.channel}`);
    console.log(`     Ingredients: ${hasIngredients ? `${recipe.ingredients.length} items` : 'Not enriched yet'}`);
  });
}

async function runFullFunctionTest() {
  console.log('🚀 Testing full function workflow...\n');
  
  // Test sync first
  const syncedCount = await testSyncFunction();
  
  // Wait a moment for database to update
  if (syncedCount > 0) {
    console.log(`\n⏳ Waiting 2 seconds for database to update...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Test enrich
  const enrichedCount = await testEnrichFunction();
  
  // Check final state
  await checkRecipesInDatabase();
  
  // Summary
  console.log('\n📋 Function Test Summary:');
  console.log(`Recipes Synced: ${syncedCount}`);
  console.log(`Recipes Enriched: ${enrichedCount}`);
  
  if (syncedCount > 0 || enrichedCount > 0) {
    console.log('\n🎉 Function workflow successful!');
    console.log('\n💡 Next steps:');
    console.log('   1. Open http://localhost:5173 in your browser');
    console.log('   2. Test the "Resync & Enrich" button');
    console.log('   3. Add recipes to grocery list');
    console.log('   4. View your grocery list page');
  } else {
    console.log('\n⚠️ No new data was synced or enriched');
    console.log('   This might be normal if all YouTube videos are already in the database');
  }
}

// Load environment and run test
import('./test-db-workflow.js').then(() => {
  runFullFunctionTest().catch(console.error);
});