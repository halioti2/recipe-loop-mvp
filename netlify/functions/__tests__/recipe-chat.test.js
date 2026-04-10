import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from '../recipe-chat.js';

const makeEvent = (body, method = 'POST') => ({
  httpMethod: method,
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.GOOGLE_AI_KEY = 'test-key';
});

describe('recipe-chat handler', () => {
  it('returns 400 when question is missing', async () => {
    const res = await handler(makeEvent({ transcript: 'some transcript' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/question/i);
  });

  it('calls Gemini and returns answer when transcript is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'I do not have transcript info.' }] } }],
      }),
    }));

    const res = await handler(makeEvent({ question: 'What is this?', transcript: '' }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).answer).toBe('I do not have transcript info.');
  });

  it('returns answer on a valid request with history', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Add garlic after the onions.' }] } }],
      }),
    }));

    const res = await handler(makeEvent({
      question: 'When do I add the garlic?',
      transcript: 'First sauté onions, then add garlic...',
      history: [
        { role: 'user', text: 'What do I sauté first?' },
        { role: 'assistant', text: 'Onions.' },
      ],
    }));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).answer).toBe('Add garlic after the onions.');

    // Verify history was passed to Gemini
    const fetchBody = JSON.parse(vi.mocked(fetch).mock.calls[0][1].body);
    const roles = fetchBody.contents.map((c) => c.role);
    expect(roles).toContain('user');
    expect(roles).toContain('model');
  });

  it('returns 500 when Gemini returns a non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    }));

    const res = await handler(makeEvent({ question: 'How long to bake?', transcript: 'Bake at 375...' }));
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/429/);
  });
});
