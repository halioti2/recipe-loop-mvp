/**
 * End-to-end enrichment pipeline test
 *
 * Inserts a test recipe row, runs the full Supadata → Gemini pipeline
 * against it (mirroring playlist-enrich-processor.js), reports timings,
 * then cleans up the test row.
 *
 * RUN:
 *   node --env-file=.env scripts/test-enrich-pipeline.js [videoUrl]
 *
 * EXAMPLES:
 *   node --env-file=.env scripts/test-enrich-pipeline.js
 *   node --env-file=.env scripts/test-enrich-pipeline.js https://www.youtube.com/watch?v=cHeu3uwsAek
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL        = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPADATA_API_KEY    = process.env.SUPADATA_API_KEY
const GEMINI_API_KEY      = process.env.GOOGLE_AI_KEY

const SUPADATA_URL = 'https://api.supadata.ai/v1/youtube/transcript'
const GEMINI_URL   = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

// Default: a known ~10 min cooking video
const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=cHeu3uwsAek'

for (const [name, val] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPADATA_API_KEY, GEMINI_API_KEY })) {
  if (!val) { console.error(`❌ Missing env var: ${name}`); process.exit(1) }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function parseVideoId(url) {
  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)
  return match ? match[1] : url.slice(-11)
}

async function run() {
  const videoUrl = process.argv[2] || DEFAULT_VIDEO_URL
  const videoId  = parseVideoId(videoUrl)

  console.log(`\n📺 Video URL: ${videoUrl}`)
  console.log(`🎬 Video ID:  ${videoId}\n`)

  // ── 1. Insert test row ────────────────────────────────────────────────────
  console.log('1️⃣  Inserting test recipe row...')
  const { data: inserted, error: insertError } = await supabase
    .from('recipes')
    .insert({ title: `[TEST] ${videoId}`, video_url: videoUrl, channel: 'test' })
    .select('id')
    .single()

  if (insertError) {
    console.error('❌ Insert failed:', insertError.message)
    process.exit(1)
  }

  const recipeId = inserted.id
  console.log(`✅ Inserted row: ${recipeId}\n`)

  try {
    // ── 2. Fetch transcript ─────────────────────────────────────────────────
    console.log('2️⃣  Fetching transcript from Supadata...')
    const t1 = Date.now()

    const transcriptRes = await fetch(`${SUPADATA_URL}?videoId=${videoId}`, {
      headers: { 'x-api-key': SUPADATA_API_KEY }
    })
    const transcriptMs = Date.now() - t1

    if (!transcriptRes.ok) {
      const text = await transcriptRes.text()
      throw new Error(`Supadata ${transcriptRes.status}: ${text}`)
    }

    const transcriptData = await transcriptRes.json()
    const transcript = (transcriptData.content || []).map(c => c.text).join(' ')

    console.log(`✅ Transcript fetched`)
    console.log(`   ⏱️  ${transcriptMs}ms`)
    console.log(`   📏 ${transcript.length} chars  |  ${transcriptData.content?.length ?? 0} segments\n`)

    if (!transcript) throw new Error('Empty transcript — no captions available for this video')

    // ── 3. Call Gemini ──────────────────────────────────────────────────────
    console.log('3️⃣  Calling Gemini for ingredient extraction...')
    const t2 = Date.now()

    const prompt = `Extract the ingredients from this recipe transcript. Return only a JSON array of ingredient strings (e.g., ["1 cup flour", "2 eggs", "1 tsp salt"]). Be specific about quantities and measurements.

Transcript: ${transcript}`

    const geminiRes = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { thinkingConfig: { thinkingBudget: 0 } } })
    })
    const geminiMs = Date.now() - t2

    if (!geminiRes.ok) {
      const text = await geminiRes.text()
      throw new Error(`Gemini ${geminiRes.status}: ${text.slice(0, 200)}`)
    }

    const geminiData = await geminiRes.json()
    const rawText    = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || ''
    console.log(`\n--- Raw Gemini response ---`)
    console.log(rawText)
    console.log(`--- End raw response ---\n`)
    const cleaned    = rawText.replace(/```json\n?|\n?```/g, '').trim()
    const ingredients = JSON.parse(cleaned)

    if (!Array.isArray(ingredients)) throw new Error(`Gemini response is not a JSON array, got: ${typeof ingredients}`)

    console.log(`✅ Gemini responded`)
    console.log(`   ⏱️  ${geminiMs}ms`)
    console.log(`   🥕 ${ingredients.length} ingredients extracted\n`)

    // ── 4. Write back to DB ─────────────────────────────────────────────────
    console.log('4️⃣  Writing transcript + ingredients to DB...')
    const t3 = Date.now()

    const { error: updateError } = await supabase
      .from('recipes')
      .update({ transcript, ingredients })
      .eq('id', recipeId)

    const dbMs = Date.now() - t3

    if (updateError) throw new Error(`DB update failed: ${updateError.message}`)

    console.log(`✅ DB updated`)
    console.log(`   ⏱️  ${dbMs}ms\n`)

    // ── Summary ─────────────────────────────────────────────────────────────
    const totalMs = transcriptMs + geminiMs + dbMs
    console.log('═'.repeat(44))
    console.log('📊 TIMING SUMMARY')
    console.log('═'.repeat(44))
    console.log(`  Supadata transcript fetch : ${transcriptMs}ms`)
    console.log(`  Gemini extraction         : ${geminiMs}ms`)
    console.log(`  DB write                  : ${dbMs}ms`)
    console.log(`  ─────────────────────────────────`)
    console.log(`  Total                     : ${totalMs}ms`)
    console.log()
    console.log('🥕 INGREDIENTS')
    ingredients.forEach((ing, i) => console.log(`  ${String(i + 1).padStart(2)}. ${ing}`))

  } finally {
    // ── 5. Cleanup ──────────────────────────────────────────────────────────
    console.log(`\n🧹 Cleaning up test row ${recipeId}...`)
    const { error: deleteError } = await supabase.from('recipes').delete().eq('id', recipeId)
    if (deleteError) console.warn(`⚠️  Cleanup failed: ${deleteError.message}`)
    else console.log('✅ Test row deleted\n')
  }
}

run().catch(err => {
  console.error('\n❌', err.message)
  process.exit(1)
})
