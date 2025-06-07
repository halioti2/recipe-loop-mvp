import { supabase } from '../../src/lib/supabaseClient.js';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  console.log('🔁 SYNC FUNCTION TRIGGERED');

  try {
    const response = await runSync();
    return { ...response, headers };
  } catch (err) {
    console.error('❌ Top-level sync error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Unexpected error.' }),
    };
  }
}

async function runSync() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const playlistId = process.env.YOUTUBE_PLAYLIST_ID;

  console.log('🔐 API Key:', apiKey ? 'Present' : '❌ MISSING');
  console.log('📺 Playlist ID:', playlistId ? 'Present' : '❌ MISSING');

  if (!apiKey || !playlistId) {
    throw new Error('Missing API key or playlist ID');
  }

  const playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}`;
  const ytRes = await fetch(playlistUrl);
  const ytData = await ytRes.json();

  if (!ytRes.ok) {
    console.error('❌ YouTube Playlist Fetch Error:', ytData);
    throw new Error(ytData.error?.message || ytRes.statusText);
  }

  const items = ytData.items || [];
  console.log('🎥 YouTube items returned:', items.length);

  const { data: existingRecipes, error: fetchError } = await supabase
    .from('recipes')
    .select('video_url');

  if (fetchError) {
    console.error('❌ Supabase Fetch Error:', fetchError);
    throw new Error('Failed to fetch existing recipes: ' + fetchError.message);
  }

  const existingUrls = new Set((existingRecipes || []).map(r => r.video_url));
  console.log('📄 Existing videos in DB:', existingUrls.size);

  const upserts = await Promise.all(
    items.map(async (item) => {
      const vid = item.snippet.resourceId?.videoId;
      if (!vid) {
        console.warn('⚠️ Missing video ID for item:', item);
        return null;
      }

      const videoUrl = `https://www.youtube.com/watch?v=${vid}`;
      if (existingUrls.has(videoUrl)) {
        console.log('⏩ Skipping existing video:', videoUrl);
        return null;
      }else{
        console.log('missing video:', videoUrl);
      }

      const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${vid}&key=${apiKey}`;
      const videoRes = await fetch(videoDetailsUrl);
      const videoData = await videoRes.json();

      const realChannelTitle = videoData.items?.[0]?.snippet?.channelTitle || 'Unknown';

      console.log('➕ Inserting video:', videoUrl);

      const insertResult = await supabase.from('recipes').insert([{
        title: item.snippet.title || 'Untitled',
        channel: realChannelTitle,
        video_url: videoUrl,
        summary: item.snippet.description || null,
        ingredients: null,
      }]);

      if (insertResult.error) {
        console.error('❌ Insert failed for video:', videoUrl, insertResult.error);
      } else {
        console.log('✅ Inserted video:', videoUrl);
      }

      return insertResult;
    })
  );

  const successful = (upserts.filter(Boolean).map(r => r?.error == null)).length;
  console.log('🎉 Total successful inserts:', successful);

  return {
    statusCode: 200,
    body: JSON.stringify({ status: 'synced', added: successful }),
  };
}

export const config = {
  schedule: "*/1 * * * *"  // Every 1 minute (if used in Netlify Scheduled Functions)
};
