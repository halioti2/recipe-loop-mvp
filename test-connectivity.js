// Quick test script to run the connectivity test
import { handler } from './netlify/functions/connectivityTest.js';

async function runTest() {
  console.log('🔍 Running connectivity test...\n');
  
  try {
    const result = await handler();
    console.log('Status Code:', result.statusCode);
    console.log('\nResponse:');
    console.log(result.body);
  } catch (error) {
    console.error('❌ Error running connectivity test:', error);
  }
}

runTest();