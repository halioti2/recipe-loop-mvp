/**
 * Remaining buffalo wings chat tests — Q22 and Q23
 * These two questions are run in isolation (no prior history) to test
 * whether the model correctly isolates specific sections from the transcript.
 *
 * RUN:
 *   node --env-file=.env scripts/test-chat-remaining.js
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL         = process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_API_KEY       = process.env.GOOGLE_AI_KEY

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'
const BUFFALO_WINGS_VIDEO_ID = '-Tz4dZKPJjk'

for (const [name, val] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY })) {
  if (!val) { console.error(`❌ Missing env var: ${name}`); process.exit(1) }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function askGemini(transcript, history, question) {
  const systemPrompt = `You are a cooking assistant. Answer questions only about the recipe below. Be concise and practical.\n\nTranscript:\n${transcript}`

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: "Understood. I'm ready to answer questions about this recipe." }] },
    ...history.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    })),
    { role: 'user', parts: [{ text: question }] },
  ]

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({ contents, generationConfig: { thinkingConfig: { thinkingBudget: 0 } } }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response)'
}

async function run() {
  // Fetch the buffalo wings transcript
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('title, transcript')
    .eq('youtube_video_id', BUFFALO_WINGS_VIDEO_ID)
    .single()

  if (error || !recipe) {
    console.error('❌ Could not fetch buffalo wings recipe:', error?.message)
    process.exit(1)
  }

  console.log(`\n📺 ${recipe.title}`)
  console.log(`📏 Transcript: ${recipe.transcript?.length ?? 0} chars\n`)
  console.log('='.repeat(60))

  const tests = [
    {
      label: 'Q22 — Walk me through the hot sauce base step by step',
      question: 'Walk me through the hot sauce base step by step',
      assess: 'Should cover: blend 85g millet chilis + garlic + 1/3 cup water → pass through fine mesh sieve → result is hot sauce base. Should NOT bleed into marinade or buffalo sauce steps.',
      history: [],
    },
    {
      label: 'Q23 — What\'s the difference between the hot sauce base and the buffalo sauce?',
      question: "What's the difference between the hot sauce base and the buffalo sauce?",
      assess: 'Should clearly distinguish them as two separate things: hot sauce base = blended xiaomila strained through sieve; buffalo sauce = built from the base + chicken stock/water + milk powder + Tabasco + sugar + rice vinegar + white pepper + MSG + garlic powder. Must not collapse them into one sauce.',
      history: [],
    },
  ]

  for (const test of tests) {
    console.log(`\n### ${test.label}`)
    console.log(`Q: "${test.question}"`)
    console.log()

    const answer = await askGemini(recipe.transcript, test.history, test.question)
    console.log(`A: ${answer}`)
    console.log()
    console.log(`Assessment criteria: ${test.assess}`)
    console.log('-'.repeat(60))
  }
}

run().catch(err => {
  console.error('\n❌', err.message)
  process.exit(1)
})
