import { supabase } from '../../src/lib/supabaseClient.js';
import { GoogleAuth } from 'google-auth-library';

// ⇩ NEW: grab credentials from env (raw JSON string)
function getGoogleCredentials() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;      // one-line JSON you pasted
  if (!raw) return null;                                 // let teammates fall back to file path
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse GCP_SERVICE_ACCOUNT_JSON:', e);
    return null;
  }
}

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const projectId = process.env.GCP_PROJECT_ID;
  const location  = process.env.GCP_LOCATION  || 'us-central1';
  const modelId   = process.env.GCP_MODEL_ID   || 'gemini-2.0-flash-001';

  if (!projectId) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing GCP_PROJECT_ID' }) };
  }

  try {
    /* ── 1. Get every recipe whose ingredients are still NULL ─────────────── */
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('id, title, channel, summary')
      .is('ingredients', null);

    if (error) throw error;
    if (!recipes.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'no recipes to enrich' }) };
    }

    /* ── 2. Prep Gemini client once ───────────────────────────────────────── */
    //const auth   = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const auth   = new GoogleAuth({
      credentials: getGoogleCredentials() || undefined, // falls back to ADC if null
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const apiUrl =
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}` +
      `/locations/${location}/publishers/google/models/${modelId}:generateContent`;

    let successCount = 0;

    /* ── 3. Loop through each recipe needing enrichment ──────────────────── */
    for (const r of recipes) {
      const prompt = `
        Extract the ingredients used in this recipe as a JSON array of strings.
        Title: ${r.title}
        Channel: ${r.channel}
        Summary: ${r.summary}
      `;

      // Call Gemini
      let raw;
      try {
        const aiRes = await client.request({
          url: apiUrl,
          method: 'POST',
          data: {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 256, temperature: 0.2 }
          }
        });
        raw = aiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } catch (gErr) {
        console.error(`Gemini error for ${r.id}:`, gErr);
        continue;                        // skip this recipe, keep looping
      }

      // Strip fences & parse
      const jsonText = raw.replace(/```json|```/g, '').trim();
      let arr;
      try {
        arr = JSON.parse(jsonText);
        if (!Array.isArray(arr)) throw new Error('not array');
      } catch (pErr) {
        console.error(`Parse fail for ${r.id}:`, pErr);
        continue;
      }

      // Update Supabase
      const { error: upErr } = await supabase
        .from('recipes')
        .update({ ingredients: arr })
        .eq('id', r.id);

      if (upErr) {
        console.error(`Supabase update fail for ${r.id}:`, upErr);
        continue;
      }

      successCount += 1;
    }

    /* ── 4. Done ─────────────────────────────────────────────────────────── */
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'enriched',
        updated: successCount,
        skipped: recipes.length - successCount
      }),
    };

  } catch (err) {
    console.error('enrich error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Unknown error' }) };
  }
}