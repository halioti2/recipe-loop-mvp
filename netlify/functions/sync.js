import { supabase } from '../../src/lib/supabaseClient.js';
import fetch from 'node-fetch';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  const playlistId = process.env.YOUTUBE_PLAYLIST_ID;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server config error: YouTube API Key missing.' }),
    };
  }

  try {
    // Fetch the playlist items
    const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
    const ytRes = await fetch(playlistUrl);
    const ytData = await ytRes.json();

    if (!ytRes.ok) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: ytData.error?.message || ytRes.statusText }),
      };
    }

    const items = ytData.items || [];

    // Now build upserts
    const upserts = await Promise.all(items.map(async (item) => {
      const vid = item.snippet.resourceId?.videoId;
      if (!vid) return null; // Skip if no videoId

      // Fetch real video details
      const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${vid}&key=${apiKey}`;
      const videoRes = await fetch(videoUrl);
      const videoData = await videoRes.json();
      
      const realChannelTitle = videoData.items?.[0]?.snippet?.channelTitle || 'Unknown';

      return supabase
        .from('recipes')
        .upsert(
          [{
            title: item.snippet.title || 'Untitled',
            channel: realChannelTitle, // <-- real video creator
            video_url: `https://www.youtube.com/watch?v=${vid}`,
            summary: item.snippet.description || null,
            ingredients: null,
          }],
          { onConflict: ['video_url'] }
        );
    }));

    const validUpserts = upserts.filter(x => x); // Filter out nulls
    const results = await Promise.all(validUpserts);
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
