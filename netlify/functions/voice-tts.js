const TTS_API_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const MAX_TEXT_LENGTH = 5000;

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

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { text } = body;

  if (!text || typeof text !== 'string' || !text.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'text is required' }) };
  }

  // Truncate at last sentence boundary if over limit
  let truncatedText = text;
  if (truncatedText.length > MAX_TEXT_LENGTH) {
    const lastPeriod = truncatedText.lastIndexOf('.', MAX_TEXT_LENGTH);
    truncatedText = lastPeriod > 0
      ? truncatedText.slice(0, lastPeriod + 1)
      : truncatedText.slice(0, MAX_TEXT_LENGTH);
  }

  const requestBody = {
    input: { text: truncatedText },
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Neural2-C',
      ssmlGender: 'FEMALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.05,
      pitch: 0.0,
    },
  };

  try {
    const response = await fetch(`${TTS_API_URL}?key=${GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Google TTS error:', response.status, errText.slice(0, 200));
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `TTS error: ${response.status}` }),
      };
    }

    const result = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ audioBase64: result.audioContent }),
    };
  } catch (err) {
    console.error('voice-tts error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
