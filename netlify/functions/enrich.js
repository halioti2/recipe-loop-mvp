import { supabase } from '../../src/lib/supabaseClient.js';
import { GoogleAuth } from 'google-auth-library';

const TRANSCRIPT_API_URL = 'https://transcript-microservice.fly.dev/transcript';

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
  const location = process.env.GCP_LOCATION || 'us-central1';
  const modelId = process.env.GCP_MODEL_ID || 'gemini-2.0-flash-001';

  if (!projectId) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing GCP_PROJECT_ID' }) };
  }

  try {
    const { data: recipes, error } = await supabase
      .from('recipes')
      .select('id, title, channel, summary, video_url')
      .is('ingredients', null);

    if (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }

    if (!recipes.length) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'no recipes to enrich' }) };
    }

    const auth = new GoogleAuth({
      credentials: getGoogleCredentials() || undefined,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const apiUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:generateContent`;

    let successCount = 0;

    for (const r of recipes) {
      let videoId = '';
      if (r.video_url) {
        const match = r.video_url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
        videoId = match ? match[1] : r.video_url.slice(-11);
      }

      let transcript = '';
      if (videoId) {
        try {
          const res = await fetch(`${TRANSCRIPT_API_URL}?video_id=${videoId}`);
          const data = await res.json();
          transcript = data.transcript || '';
          console.log(`🌐 Transcript service response for ${videoId}:`, JSON.stringify(data, null, 2));
            if (transcript) {
              console.log(`🗣 Transcript for ${videoId} (first 300 chars):\n${transcript.slice(0, 300)}...`);
            } else {
              console.warn(`⚠️ No transcript returned for ${videoId}`);
            }
        } catch (e) {
          console.warn(`Transcript fetch failed for ${videoId}:`, e.message);
        }
      }

      const prompt = `\nExtract the ingredients used in this recipe as a JSON array of strings.\nEach string should be a single ingredient, such as "1 cup flour" or "2 eggs".\n\nTitle: ${r.title}\nChannel: ${r.channel}\nSummary: ${r.summary}
      ${transcript ? `Transcript: ${transcript}` : ''}`;

      console.log(`📝 Gemini Prompt for recipe ${r.id}:\n${prompt}`);

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
        console.log(`📨 Gemini response for ${r.id}:\n`, raw);
      } catch (gErr) {
        console.error(`Gemini error for ${r.id}:`, gErr);
        continue;
      }

      const jsonText = raw.replace(/```json|```/g, '').trim();
      let arr;
      try {
        arr = JSON.parse(jsonText);
        if (!Array.isArray(arr)) throw new Error('not array');
      } catch (pErr) {
        console.error(`Parse fail for ${r.id}:`, pErr);
        continue;
      }

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
