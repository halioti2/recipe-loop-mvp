const STT_API_URL = 'https://speech.googleapis.com/v1/speech:recognize';
const MAX_BODY_SIZE = 1_400_000; // ~1MB in base64 ≈ 15s of webm/opus audio

export async function handler(event) {
  const GOOGLE_API_KEY = process.env.GOOGLE_CLOUD_API_KEY || process.env.GOOGLE_AI_KEY;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!event.body) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No audio data provided' }) };
  }

  if (event.body.length > MAX_BODY_SIZE) {
    return { statusCode: 413, headers, body: JSON.stringify({ error: 'Audio too large. Keep recordings under 15 seconds.' }) };
  }

  // Netlify base64-encodes binary bodies when isBase64Encoded is true
  const audioBase64 = event.isBase64Encoded
    ? event.body
    : Buffer.from(event.body).toString('base64');

  // Detect encoding from Content-Type header
  const contentType = (event.headers?.['content-type'] || '').toLowerCase();
  let encoding = 'WEBM_OPUS';
  let sampleRateHertz = 48000;

  if (contentType.includes('mp4') || contentType.includes('m4a')) {
    encoding = 'ENCODING_UNSPECIFIED';
    sampleRateHertz = 0; // auto-detect for Safari
  }

  const requestBody = {
    config: {
      encoding,
      sampleRateHertz,
      languageCode: 'en-US',
      model: 'latest_short',
      enableAutomaticPunctuation: true,
    },
    audio: { content: audioBase64 },
  };

  try {
    const response = await fetch(`${STT_API_URL}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Google STT error:', response.status, errText.slice(0, 200));
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `STT error: ${response.status}` }),
      };
    }

    const result = await response.json();
    const transcript = result.results?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = result.results?.[0]?.alternatives?.[0]?.confidence || 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ transcript, confidence }),
    };
  } catch (err) {
    console.error('voice-stt error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
