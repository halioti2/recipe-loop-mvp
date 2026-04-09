/**
 * Test Supadata transcript fetch
 *
 * RUN: SUPADATA_API_KEY=<key> node scripts/test-transcript-supadata.js [videoId]
 *
 * Defaults to a known ~10 minute cooking video if no videoId is provided.
 */

const SUPADATA_API_KEY = process.env.SUPADATA_API_KEY;
const SUPADATA_TRANSCRIPT_URL = 'https://api.supadata.ai/v1/youtube/transcript';

if (!SUPADATA_API_KEY) {
  console.error('❌ Missing SUPADATA_API_KEY');
  process.exit(1);
}

// Default: Joshua Weissman's "But Better" burger (~10 min)
const videoId = process.argv[2] || 'gPqsOa1OUPA';

async function run() {
  console.log(`\n📺 Video ID: ${videoId}`);
  console.log(`🌐 Fetching transcript from Supadata...\n`);

  const start = Date.now();

  const res = await fetch(`${SUPADATA_TRANSCRIPT_URL}?videoId=${videoId}`, {
    headers: { 'x-api-key': SUPADATA_API_KEY },
  });

  const elapsed = Date.now() - start;

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ Supadata error ${res.status}: ${text}`);
    process.exit(1);
  }

  const json = await res.json();
  const segments = json.content || [];
  const transcript = segments.map(c => c.text).join(' ');

  console.log(`⏱️  Response time:   ${elapsed}ms`);
  console.log(`📝 Segments:        ${segments.length}`);
  console.log(`📏 Total length:    ${transcript.length} chars`);
  console.log(`\n--- Preview (first 500 chars) ---`);
  console.log(transcript.slice(0, 500));
  console.log(`\n--- Preview (last 500 chars) ---`);
  console.log(transcript.slice(-500));
}

run().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
