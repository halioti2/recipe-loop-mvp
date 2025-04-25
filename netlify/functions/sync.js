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

  try {
    const response = await runSync(); // ⬅️ Wrap the whole thing in a function
    return { ...response, headers };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Unexpected error.' }),
    };
  }
}

// All async code is safely inside here
async function runSync() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const playlistId = process.env.YOUTUBE_PLAYLIST_ID;

  if (!apiKey || !playlistId) {
    throw new Error('Missing API key or playlist ID');
  }

  const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
  const ytRes = await fetch(playlistUrl);
  const ytData = await ytRes.json();

  if (!ytRes.ok) {
    throw new Error(ytData.error?.message || ytRes.statusText);
  }

  const items = ytData.items || [];

  // Fetch existing video URLs from Supabase
  const { data: existingRecipes, error: fetchError } = await supabase
    .from('recipes')
    .select('video_url');

  if (fetchError) {
    throw new Error('Failed to fetch existing recipes: ' + fetchError.message);
  }

  const existingUrls = new Set((existingRecipes || []).map(r => r.video_url));

  const upserts = await Promise.all(
    items.map(async (item) => {
      const vid = item.snippet.resourceId?.videoId;
      if (!vid) return null;

      const videoUrl = `https://www.youtube.com/watch?v=${vid}`;
      if (existingUrls.has(videoUrl)) return null;

      const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${vid}&key=${apiKey}`;
      const videoRes = await fetch(videoDetailsUrl);
      const videoData = await videoRes.json();

      const realChannelTitle = videoData.items?.[0]?.snippet?.channelTitle || 'Unknown';

      return supabase.from('recipes').insert([{
        title: item.snippet.title || 'Untitled',
        channel: realChannelTitle,
        video_url: videoUrl,
        summary: item.snippet.description || null,
        ingredients: null,
      }]);
    })
  );

  const successful = (upserts.filter(Boolean).map(r => r?.error == null)).length;

  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'synced', count: successful }),
  };
}
