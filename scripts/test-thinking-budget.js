/**
 * Thinking budget hypothesis test — Buffalo Wings Tabasco miss
 *
 * The Tabasco miss (Q7 from RE_chat_test_results_buffalo_wings.md) is a
 * confirmed repeatable failure at thinkingBudget: 0. The hypothesis is that
 * this is a reasoning failure, not a context window failure — the transcript
 * is only ~15,000 chars and fits easily in Gemini's context window.
 *
 * This script runs the exact Q7 scenario at three thinking budgets to
 * determine whether a budget increase fixes the miss before committing to
 * the map-reduce summarization pipeline.
 *
 * RUN:
 *   node --env-file=.env scripts/test-thinking-budget.js
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

// Q7 scenario — run in a chained session matching the original test
// History: Q1 through Q6 responses that preceded Q7 in the original chain
const HISTORY = [
  { role: 'user', text: "What's the first step in this recipe?" },
  { role: 'assistant', text: "The first step is to marinate the wings." },
  { role: 'user', text: "What about the last step?" },
  { role: 'assistant', text: "Serve the wings with celery, fresh mild chilies, and blue cheese dressing." },
  { role: 'user', text: "What's the step after the first step?" },
  { role: 'assistant', text: "Whisk one egg white and mix it with a slurry of 10g each of water and cornstarch, then mix well with the wings." },
  { role: 'user', text: "When you say blending the chili garlic and water, what do you mean?" },
  { role: 'assistant', text: "Blend 85g of millet chilis with 1-2 cloves of garlic and 1/3 cup of water, then pass through a fine mesh sieve to create the hot sauce base." },
  { role: 'user', text: "What do you do with the strained water and what's left in the sieve?" },
  { role: 'assistant', text: "The strained liquid is your hot sauce base. The recipe does not specify what to do with the solids, implying they are discarded." },
  { role: 'user', text: "What do you do next?" },
  { role: 'assistant', text: "After creating the hot sauce base, combine it with chicken stock or water, milk powder, Tabasco, sugar, rice vinegar, white pepper, MSG, and garlic powder." },
]

const Q7 = "I have the bouillon, chili powder, soy sauce, bourbon, white pepper — am I missing something?"

// Ground truth: Tabasco should be named as missing
// The marinade is: salt, chicken bouillon powder, red fragrant chili powder, spicy chili powder,
//                  soy sauce, bourbon, Tabasco, white pepper, garlic powder
const EXPECTED_MISSING = ['tabasco', 'salt', 'garlic powder', 'spicy chili powder']

async function ask(transcript, thinkingBudget) {
  const systemPrompt = `You are a cooking assistant. Answer questions only about the recipe below. Be concise and practical.\n\nTranscript:\n${transcript}`

  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: "Understood. I'm ready to answer questions about this recipe." }] },
    ...HISTORY.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    })),
    { role: 'user', parts: [{ text: Q7 }] },
  ]

  const start = Date.now()
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents,
      generationConfig: { thinkingConfig: { thinkingBudget } },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response)'
  const ms = Date.now() - start
  const thinking = data.candidates?.[0]?.content?.parts?.find(p => p.thought)?.text

  return { answer, ms, thinking }
}

function grade(answer) {
  const lower = answer.toLowerCase()
  const found = EXPECTED_MISSING.filter(item => lower.includes(item))
  const tabasco = lower.includes('tabasco')
  return { tabasco, found, pass: tabasco }
}

async function main() {
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('title, transcript')
    .eq('youtube_video_id', BUFFALO_WINGS_VIDEO_ID)
    .single()

  if (error || !recipe) {
    console.error('❌ Could not fetch buffalo wings recipe:', error?.message)
    process.exit(1)
  }

  console.log(`📺  ${recipe.title}`)
  console.log(`📏  Transcript: ${recipe.transcript.length.toLocaleString()} chars`)
  console.log(`\nQ7: "${Q7}"`)
  console.log(`\nGround truth missing: ${EXPECTED_MISSING.join(', ')}`)
  console.log('\nRunning at three thinking budgets...\n')
  console.log('='.repeat(70))

  const budgets = [
    { label: 'thinkingBudget: 0  (current — non-thinking)', value: 0 },
    { label: 'thinkingBudget: 1024', value: 1024 },
    { label: 'thinkingBudget: 8192', value: 8192 },
  ]

  for (const budget of budgets) {
    console.log(`\n--- ${budget.label} ---`)
    try {
      const { answer, ms } = await ask(recipe.transcript, budget.value)
      const result = grade(answer)

      console.log(`Answer: ${answer.trim()}`)
      console.log(`\nTabasco named: ${result.tabasco ? '✅ YES' : '❌ NO'}`)
      console.log(`Missing items found: ${result.found.length > 0 ? result.found.join(', ') : '(none)'}`)
      console.log(`Time: ${ms}ms`)
      console.log(`Result: ${result.pass ? '✅ PASS' : '❌ FAIL'}`)
    } catch (err) {
      console.log(`❌ Error: ${err.message}`)
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('\nHypothesis: if a higher thinkingBudget fixes the miss, the')
  console.log('map-reduce pipeline is not needed for Phase 1. A 1-line change')
  console.log('to recipe-chat.js (increase thinkingBudget) solves the problem.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
