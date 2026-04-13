const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export async function handler(event) {
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

  const { question, transcript, history = [] } = body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'question is required' }) };
  }

  // Build conversation contents for Gemini
  // System context + transcript as the first user turn, then prior history, then current question
  const systemPrompt = `You are a cooking assistant. Answer questions only about the recipe below. Be concise and practical.${
    transcript ? `\n\nTranscript:\n${transcript}` : '\n\nNo transcript is available for this recipe.'
  }`;

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. I\'m ready to answer questions about this recipe.' }] },
    ...history.map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    })),
    { role: 'user', parts: [{ text: question }] },
  ];

  try {
    const geminiResponse = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errText.slice(0, 200));
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Gemini error: ${geminiResponse.status}` }),
      };
    }

    const geminiResult = await geminiResponse.json();
    const answer = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'No response from Gemini' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ answer }) };
  } catch (err) {
    console.error('recipe-chat error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
}
