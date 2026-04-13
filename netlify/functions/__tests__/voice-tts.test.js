import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../voice-tts.js';

const makeEvent = (body, method = 'POST') => ({
  httpMethod: method,
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.GOOGLE_CLOUD_API_KEY = 'test-key';
});

describe('voice-tts handler', () => {
  it('returns 405 for GET requests', async () => {
    const res = await handler({ httpMethod: 'GET' });
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when text is missing', async () => {
    const res = await handler(makeEvent({}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/text is required/i);
  });

  it('returns 400 when text is empty string', async () => {
    const res = await handler(makeEvent({ text: '  ' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/text is required/i);
  });

  it('calls Google TTS with correct voice config and returns audio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: 'base64-mp3-data' }),
    }));

    const res = await handler(makeEvent({ text: 'Preheat the oven to 375.' }));
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.audioBase64).toBe('base64-mp3-data');

    // Verify correct API URL
    const fetchUrl = vi.mocked(fetch).mock.calls[0][0];
    expect(fetchUrl).toContain('texttospeech.googleapis.com');
    expect(fetchUrl).toContain('key=test-key');

    // Verify voice config
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(fetchBody.voice.name).toBe('en-US-Neural2-C');
    expect(fetchBody.audioConfig.speakingRate).toBe(1.05);
    expect(fetchBody.audioConfig.audioEncoding).toBe('MP3');
  });

  it('truncates text at sentence boundary when over 5000 chars', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ audioContent: 'base64-data' }),
    }));

    // Create text over 5000 chars with a sentence boundary before the limit
    const longText = 'This is a sentence. '.repeat(300); // ~6000 chars
    await handler(makeEvent({ text: longText }));

    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(fetchBody.input.text.length).toBeLessThanOrEqual(5000);
    expect(fetchBody.input.text.endsWith('.')).toBe(true);
  });

  it('returns 500 when Google TTS returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request',
    }));

    const res = await handler(makeEvent({ text: 'Hello' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/400/);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await handler({ httpMethod: 'POST', body: 'not-json' });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/invalid json/i);
  });
});
