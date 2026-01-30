export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  // Debug environment variables
  const envDebug = {
    NODE_VERSION: process.env.NODE_VERSION,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? 'Present' : 'Missing',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? 'Present' : 'Missing',
    GCP_SERVICE_ACCOUNT_JSON: process.env.GCP_SERVICE_ACCOUNT_JSON ? 'Present' : 'Missing',
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Not set',
    VITE_GEMINI_API_KEY: process.env.VITE_GEMINI_API_KEY ? 'Present' : 'Missing',
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || 'Not set',
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: 'environment debug',
      environment: envDebug,
      nodeVersion: process.version
    }, null, 2),
  };
}