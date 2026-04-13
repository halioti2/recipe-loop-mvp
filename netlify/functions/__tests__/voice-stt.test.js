import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../voice-stt.js';

const makeBinaryEvent = (body, contentType = 'audio/webm;codecs=opus', isBase64Encoded = true) => ({
  httpMethod: 'POST',
  headers: { 'content-type': contentType },
  body: body,
  isBase64Encoded,
});

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.GOOGLE_CLOUD_API_KEY = 'test-key';
});

describe('voice-stt handler', () => {
  it('returns 405 for GET requests', async () => {
    const res = await handler({ httpMethod: 'GET', headers: {} });
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when body is empty', async () => {
    const res = await handler({ httpMethod: 'POST', headers: {}, body: null });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/no audio/i);
  });

  it('returns 413 for oversized body', async () => {
    const largeBody = 'a'.repeat(1_500_000);
    const res = await handler(makeBinaryEvent(largeBody));
    expect(res.statusCode).toBe(413);
    expect(JSON.parse(res.body).error).toMatch(/too large/i);
  });

  it('calls Google STT with correct URL and returns transcript', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ alternatives: [{ transcript: 'how long do I bake it', confidence: 0.95 }] }],
      }),
    }));

    const res = await handler(makeBinaryEvent('dGVzdC1hdWRpbw==')); // base64 of "test-audio"
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.transcript).toBe('how long do I bake it');
    expect(body.confidence).toBe(0.95);

    // Verify correct API URL with key
    const fetchUrl = vi.mocked(fetch).mock.calls[0][0];
    expect(fetchUrl).toContain('speech.googleapis.com');
    expect(fetchUrl).toContain('key=test-key');
  });

  it('returns empty transcript when STT returns no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));

    const res = await handler(makeBinaryEvent('dGVzdA=='));
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.transcript).toBe('');
    expect(body.confidence).toBe(0);
  });

  it('returns 500 when Google STT returns non-200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    }));

    const res = await handler(makeBinaryEvent('dGVzdA=='));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/429/);
  });

  it('detects Safari mp4 content type and uses ENCODING_UNSPECIFIED', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ alternatives: [{ transcript: 'test', confidence: 0.9 }] }],
      }),
    }));

    await handler(makeBinaryEvent('dGVzdA==', 'audio/mp4'));

    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    expect(fetchBody.config.encoding).toBe('ENCODING_UNSPECIFIED');
    expect(fetchBody.config.sampleRateHertz).toBe(0);
  });

  it('base64-encodes body when isBase64Encoded is false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ alternatives: [{ transcript: 'test', confidence: 0.9 }] }],
      }),
    }));

    await handler(makeBinaryEvent('raw-audio-bytes', 'audio/webm;codecs=opus', false));

    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    // Should be base64 of "raw-audio-bytes"
    expect(fetchBody.audio.content).toBe(Buffer.from('raw-audio-bytes').toString('base64'));
  });
});
