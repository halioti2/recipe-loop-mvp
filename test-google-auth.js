// Test Google Cloud API key and credentials
import dotenv from 'dotenv';
import { GoogleAuth } from 'google-auth-library';

dotenv.config();

function getGoogleCredentials() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse GCP_SERVICE_ACCOUNT_JSON:', e);
    return null;
  }
}

async function testGoogleAuth() {
  console.log('🔐 Testing Google Cloud authentication...\n');
  
  // Check environment variables
  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.GCP_LOCATION || 'us-central1';
  const modelId = process.env.GCP_MODEL_ID || 'gemini-2.0-flash-001';
  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_JSON;
  
  console.log('📋 Environment Variables:');
  console.log(`  GCP_PROJECT_ID: ${projectId ? '✅ Present' : '❌ Missing'}`);
  console.log(`  GCP_LOCATION: ${location}`);
  console.log(`  GCP_MODEL_ID: ${modelId}`);
  console.log(`  GCP_SERVICE_ACCOUNT_JSON: ${serviceAccountJson ? '✅ Present (length: ' + serviceAccountJson.length + ')' : '❌ Missing'}`);
  
  if (!projectId) {
    console.log('\n❌ Missing GCP_PROJECT_ID - cannot continue');
    return;
  }
  
  if (!serviceAccountJson) {
    console.log('\n❌ Missing GCP_SERVICE_ACCOUNT_JSON - cannot continue');
    return;
  }
  
  // Try to parse service account JSON
  const credentials = getGoogleCredentials();
  if (!credentials) {
    console.log('\n❌ Failed to parse service account JSON');
    return;
  }
  
  console.log('\n✅ Service account JSON parsed successfully');
  console.log(`  Type: ${credentials.type}`);
  console.log(`  Project ID: ${credentials.project_id}`);
  console.log(`  Client Email: ${credentials.client_email}`);
  
  // Test Google Auth initialization
  try {
    console.log('\n🚀 Testing Google Auth initialization...');
    
    const auth = new GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    
    console.log('✅ Google Auth object created successfully');
    
    // Try to get a client
    const client = await auth.getClient();
    console.log('✅ Google Auth client obtained');
    
    // Test API URL construction
    const apiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:generateContent`;
    console.log(`\n🌐 API URL: ${apiUrl}`);
    
    // Try a simple test request (this might fail due to auth but we can see the error)
    try {
      console.log('\n📡 Testing API request...');
      const response = await client.request({
        url: apiUrl,
        method: 'POST',
        data: {
          contents: [{ role: 'user', parts: [{ text: 'Test prompt: list 3 basic ingredients' }] }],
          generationConfig: { maxOutputTokens: 50, temperature: 0.1 }
        }
      });
      
      console.log('✅ API request successful!');
      const result = response.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
      console.log(`📝 API Response: ${result.slice(0, 100)}...`);
      
    } catch (apiError) {
      console.log('❌ API request failed:', apiError.message);
      
      if (apiError.message.includes('permission')) {
        console.log('💡 This looks like a permissions issue');
      } else if (apiError.message.includes('quota')) {
        console.log('💡 This looks like a quota/billing issue');
      } else if (apiError.message.includes('not found')) {
        console.log('💡 The model or project might not exist or be accessible');
      }
    }
    
  } catch (authError) {
    console.log('❌ Google Auth failed:', authError.message);
    console.log('\n💡 Possible issues:');
    console.log('  • Invalid service account JSON format');
    console.log('  • Service account lacks necessary permissions');
    console.log('  • Google Cloud API not enabled');
    console.log('  • Network connectivity issues');
  }
}

testGoogleAuth().catch(console.error);