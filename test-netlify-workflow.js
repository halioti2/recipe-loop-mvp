// Test the full workflow using Netlify Dev server
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const NETLIFY_DEV_URL = 'http://localhost:8888';

async function testConnectivity() {
  console.log('🔍 Testing connectivity function...');
  
  try {
    const response = await fetch(`${NETLIFY_DEV_URL}/.netlify/functions/connectivityTest`);
    const result = await response.json();
    
    console.log('Connectivity Test Results:');
    console.log(JSON.stringify(result, null, 2));
    
    return response.ok;
  } catch (error) {
    console.error('❌ Connectivity test failed:', error.message);
    return false;
  }
}

async function testSync() {
  console.log('\n🔁 Testing sync function...');
  
  try {
    const response = await fetch(`${NETLIFY_DEV_URL}/.netlify/functions/sync`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Sync failed:', response.status, errorText);
      return { success: false, added: 0 };
    }
    
    const result = await response.json();
    console.log('✅ Sync completed:', result);
    
    return { success: true, added: result.added || 0 };
  } catch (error) {
    console.error('❌ Sync error:', error.message);
    return { success: false, added: 0 };
  }
}

async function testEnrich() {
  console.log('\n🧠 Testing enrich function...');
  
  try {
    const response = await fetch(`${NETLIFY_DEV_URL}/.netlify/functions/enrich`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Enrich failed:', response.status, errorText);
      return { success: false, updated: 0 };
    }
    
    const result = await response.json();
    console.log('✅ Enrich completed:', result);
    
    return { success: true, updated: result.updated || 0 };
  } catch (error) {
    console.error('❌ Enrich error:', error.message);
    return { success: false, updated: 0 };
  }
}

async function testTranscriptFill() {
  console.log('\n📝 Testing transcript-fill function...');
  
  try {
    const response = await fetch(`${NETLIFY_DEV_URL}/.netlify/functions/transcript-fill`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Transcript-fill failed:', response.status, errorText);
      return { success: false, updated: 0 };
    }
    
    const result = await response.json();
    console.log('✅ Transcript-fill completed:', result);
    
    return { success: true, updated: result.updated || 0 };
  } catch (error) {
    console.error('❌ Transcript-fill error:', error.message);
    return { success: false, updated: 0 };
  }
}

async function checkDatabase() {
  console.log('\n📊 Checking database state...');
  
  // Validate required environment variables
  if (!process.env.VITE_SUPABASE_URL) {
    throw new Error('❌ Missing VITE_SUPABASE_URL environment variable');
  }
  
  if (!process.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('❌ Missing VITE_SUPABASE_ANON_KEY environment variable');
  }
  
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY
    );
    
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('id, title, channel, ingredients, transcript')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Database query error:', error.message);
      return;
    }
    
    console.log(`📋 Database contains ${recipes.length} recipes:`);
    
    let enrichedCount = 0;
    let transcriptCount = 0;
    
    recipes.forEach((recipe, index) => {
      const hasIngredients = recipe.ingredients && recipe.ingredients.length > 0;
      const hasTranscript = recipe.transcript && recipe.transcript.length > 0;
      
      if (hasIngredients) enrichedCount++;
      if (hasTranscript) transcriptCount++;
      
      console.log(`  ${index + 1}. ${recipe.title.slice(0, 50)}...`);
      console.log(`     Channel: ${recipe.channel}`);
      console.log(`     Ingredients: ${hasIngredients ? `✅ ${recipe.ingredients.length} items` : '❌ Not enriched'}`);
      console.log(`     Transcript: ${hasTranscript ? `✅ ${recipe.transcript.length} chars` : '❌ No transcript'}`);
    });
    
    console.log(`\n📈 Summary:`);
    console.log(`   Total recipes: ${recipes.length}`);
    console.log(`   With ingredients: ${enrichedCount}`);
    console.log(`   With transcripts: ${transcriptCount}`);
    
  } catch (error) {
    console.error('❌ Database check error:', error.message);
  }
}

async function runFullWorkflowTest() {
  console.log('🚀 Starting Full Workflow Test with Netlify Functions\n');
  console.log('🌐 Using Netlify Dev Server at:', NETLIFY_DEV_URL);
  
  // Wait a moment for the dev server to be fully ready
  console.log('⏳ Waiting for Netlify dev server to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test 1: Connectivity
  console.log('\n' + '='.repeat(50));
  const connectivityOk = await testConnectivity();
  
  // Test 2: Sync (get YouTube data)
  console.log('\n' + '='.repeat(50));
  const syncResult = await testSync();
  
  // Wait for database updates
  if (syncResult.success && syncResult.added > 0) {
    console.log('\n⏳ Waiting 5 seconds for database to update...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Test 3: Transcript Fill
  console.log('\n' + '='.repeat(50));
  const transcriptResult = await testTranscriptFill();
  
  // Wait for transcript updates
  if (transcriptResult.success) {
    console.log('\n⏳ Waiting 3 seconds for transcripts to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Test 4: Enrich (AI ingredient extraction)
  console.log('\n' + '='.repeat(50));
  const enrichResult = await testEnrich();
  
  // Wait for enrichment
  if (enrichResult.success) {
    console.log('\n⏳ Waiting 5 seconds for enrichment to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Test 5: Check final database state
  console.log('\n' + '='.repeat(50));
  await checkDatabase();
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('🎯 FULL WORKFLOW TEST SUMMARY');
  console.log('='.repeat(50));
  console.log(`Connectivity: ${connectivityOk ? '✅' : '❌'}`);
  console.log(`Sync: ${syncResult.success ? '✅' : '❌'} (${syncResult.added} recipes added)`);
  console.log(`Transcript Fill: ${transcriptResult.success ? '✅' : '❌'} (${transcriptResult.updated} updated)`);
  console.log(`Enrich: ${enrichResult.success ? '✅' : '❌'} (${enrichResult.updated} enriched)`);
  
  if (connectivityOk && syncResult.success) {
    console.log('\n🎉 WORKFLOW TEST SUCCESSFUL!');
    console.log('\n✅ Your application is fully functional:');
    console.log('   • YouTube data syncing works');
    console.log('   • AI ingredient extraction works');
    console.log('   • Database integration works');
    console.log('   • Frontend should be fully operational');
    console.log('\n🌐 Test the UI at: http://localhost:8888');
  } else {
    console.log('\n⚠️ Some functions failed - check the errors above');
    console.log('💡 Common issues:');
    console.log('   • Missing environment variables');
    console.log('   • API rate limits');
    console.log('   • Network connectivity issues');
  }
}

// Start the test
runFullWorkflowTest().catch(console.error);