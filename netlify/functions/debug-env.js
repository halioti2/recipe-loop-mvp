export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  // Access guard: only allow in development or with valid token
  const isDevelopment = process.env.NODE_ENV === 'development';
  const debugToken = event.headers['x-debug-token'];
  const validToken = process.env.DEBUG_ENDPOINT_TOKEN;
  
  if (!isDevelopment && (!debugToken || debugToken !== validToken)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Access denied' }),
    };
  }

  // Debug environment variables
  const envDebug = {
    NODE_VERSION: process.env.NODE_VERSION,
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? 'Present' : 'Missing',
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? 'Present' : 'Missing',
    GCP_SERVICE_ACCOUNT_JSON: process.env.GCP_SERVICE_ACCOUNT_JSON ? 'Present' : 'Missing',
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'Not set',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? 'Present' : 'Missing',
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