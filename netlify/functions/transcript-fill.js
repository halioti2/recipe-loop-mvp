import { supabase } from '../../src/lib/supabaseClient.js';

const TRANSCRIPT_API_URL = 'https://transcript-microservice.fly.dev/transcript';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, video_url')
    .is('transcript', null)
    .limit(2);

  if (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }

  let success = 0;

  for (const r of recipes.slice(0, 3)) {  // Limit per call
    try {
      const match = r.video_url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
      const videoId = match ? match[1] : r.video_url.slice(-11);

      const res = await fetch(`${TRANSCRIPT_API_URL}?video_id=${videoId}`);
      const json = await res.json();
      const transcript = json.transcript?.slice(0, 3000) || ''; // optional length cap

      if (transcript) {
        const { error: upErr } = await supabase
          .from('recipes')
          .update({ transcript })
          .eq('id', r.id);

        if (!upErr) success += 1;
        else console.warn(`❌ Update failed for ${r.id}:`, upErr.message);
      } else {
        console.warn(`⚠️ Empty transcript for ${r.id}`);
      }
    } catch (err) {
      console.warn(`🚫 Transcript fetch failed for ${r.id}:`, err.message);
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ status: 'transcripts saved', updated: success }),
  };
}
