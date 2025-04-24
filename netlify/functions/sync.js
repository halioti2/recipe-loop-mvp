import { supabase } from '../../src/lib/supabaseClient.js';
import fetch from 'node-fetch';

export async function handler(event, context) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const apiKey    = process.env.YOUTUBE_API_KEY;
  const playlistId= process.env.YOUTUBE_PLAYLIST_ID;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server config error: YouTube API Key missing.' }),
    };
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
    const ytRes = await fetch(url);
    const ytData= await ytRes.json();

    if (!ytRes.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: ytData.error?.message || ytRes.statusText }),
      };
    }

    // 2. Prepare upsert calls, wrapping each row in an array and deduping on video_url
    const items = ytData.items || [];
    const upserts = items
      .map(item => {
        const vid = item.snippet.resourceId?.videoId;
        if (!vid) return null;

        return supabase
          .from('recipes')
          .upsert(
            [{
              title:       item.snippet.title    || 'Untitled',
              channel:     item.snippet.channelTitle || 'Unknown',
              video_url:   `https://www.youtube.com/watch?v=${vid}`,
              summary:     item.snippet.description || null,
              ingredients: null,
            }],
            { onConflict: ['video_url'] }
          );
      })
      .filter(x => x);  // drop any nulls


    const results = await Promise.all(upserts);
    const successCount = results.filter(r => !r.error).length;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'synced', count: successCount }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Unexpected error.' }),
    };
  }
}
