export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const apiKey = process.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Missing API key' }) 
    };
  }

  try {
    // List available models
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: `API error: ${response.status} ${errorText}` }),
      };
    }

    const data = await response.json();
    
    // Filter for models that support generateContent
    const contentModels = data.models?.filter(model => 
      model.supportedGenerationMethods?.includes('generateContent')
    ) || [];

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'models listed',
        totalModels: data.models?.length || 0,
        contentGenerationModels: contentModels.length,
        models: contentModels.map(model => ({
          name: model.name,
          displayName: model.displayName,
          supportedMethods: model.supportedGenerationMethods
        }))
      }, null, 2),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
}