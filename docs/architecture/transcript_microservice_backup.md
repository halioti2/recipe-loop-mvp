# Transcript Microservice — Legacy Code Reference

**Superseded by:** ADR 004 (Supadata API migration, 2026-03-24)
**Reason for keeping:** Backup reference in case Supadata API requires rollback

---

## Service Details

- **Endpoint:** `https://transcript-microservice.fly.dev/transcript?video_id={videoId}`
- **Auth:** None (no API key required)
- **Response shape:** `{ "transcript": "full transcript text here..." }`
- **Hosted on:** Fly.io
- **Cost:** ~$7/month (residential proxy service)

---

## Old Code Patterns

### Constants (all 3 functions)

```js
const TRANSCRIPT_API_URL = 'https://transcript-microservice.fly.dev/transcript'
```

---

### playlist-enrich-processor.js — fetch + parse

```js
const transcriptResponse = await fetch(`${TRANSCRIPT_API_URL}?video_id=${videoId}`)

if (transcriptResponse.ok) {
  const transcriptData = await transcriptResponse.json()

  if (transcriptData.transcript) {
    transcript = transcriptData.transcript.slice(0, 3000)
    console.log(`✅ Transcript fetched for: ${recipe.title}`)
  } else {
    console.log(`⚠️  Empty transcript for: ${recipe.title}`)
  }
}
```

---

### transcript-fill.js — fetch + parse

```js
const res = await fetch(`${TRANSCRIPT_API_URL}?video_id=${videoId}`);
const json = await res.json();
const transcript = json.transcript?.slice(0, 3000) || '';
```

---

### enrich.js — fetch + parse (with AbortController)

```js
// AbortController set up before this block with 10s timeout
const res = await fetch(`${TRANSCRIPT_API_URL}?video_id=${videoId}`, {
  signal: controller.signal
});

clearTimeout(timeoutId);

const data = await res.json();
if (data.transcript) {
  transcript = data.transcript.slice(0, 3000);
  console.log(`🌐 Fetched transcript for ${videoId} (${data.transcript.length} chars, truncated to ${transcript.length})`);
}
```

---

## How to Rollback

To revert to the microservice in any function, replace the Supadata constants and fetch blocks with the patterns above. No API key or auth header is needed — the microservice has no authentication.

Remove `SUPADATA_API_KEY` and `SUPADATA_TRANSCRIPT_URL` constants and replace with:

```js
const TRANSCRIPT_API_URL = 'https://transcript-microservice.fly.dev/transcript'
```
