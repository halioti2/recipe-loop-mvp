export const handler = async () => {
    const responses = {
      supabase: null,
      vertexAI: null,
      errors: {},
    };
  
    // Test Supabase (unauthenticated public ping)
    try {
      const supaRes = await fetch('https://tvuyhlckthqtoxctxoew.supabase.co/rest/v1/recipes');
      responses.supabase = `Supabase responded with status ${supaRes.status}`;
    } catch (err) {
      responses.errors.supabase = err.message;
    }
  
    // Test Vertex AI (unauthenticated root call)
    try {
      const vertexRes = await fetch('https://aiplatform.googleapis.com/');
      responses.vertexAI = `Vertex AI responded with status ${vertexRes.status}`;
    } catch (err) {
      responses.errors.vertexAI = err.message;
    }
  
    return {
      statusCode: 200,
      body: JSON.stringify(responses, null, 2),
    };
  };
  