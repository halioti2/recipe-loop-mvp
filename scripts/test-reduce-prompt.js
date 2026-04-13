/**
 * Reduce prompt evaluation — Honey Miso Short Rib
 *
 * Takes the 6 map-phase JSON summaries produced by test-map-prompt.js
 * (JSON format run, 2026-04-12) and sends them to the candidate reduce
 * prompt. Evaluates whether Gemini can deduplicate ingredients, preserve
 * step order, and produce a single coherent recipe summary.
 *
 * Resolves OQ6 from RE_open_questions_chunking.md.
 *
 * RUN:
 *   node --env-file=.env scripts/test-reduce-prompt.js
 */

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

if (!GEMINI_API_KEY) {
  console.error('❌ Missing env var: GOOGLE_AI_KEY')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Map phase outputs — captured from test-map-prompt.js (JSON format run)
// Code fences stripped; these are the cleaned parsed objects
// ---------------------------------------------------------------------------

const MAP_SUMMARIES = [
  {
    "ingredients": [
      { "name": "green onion", "quantity": null },
      { "name": "garlic", "quantity": null },
      { "name": "ginger", "quantity": null },
      { "name": "star anise", "quantity": null },
      { "name": "shallot", "quantity": "one" },
      { "name": "short ribs", "quantity": null },
      { "name": "salt", "quantity": null },
      { "name": "black pepper", "quantity": null },
      { "name": "neutral oil (avocado)", "quantity": null }
    ],
    "steps": [
      "Season the short ribs with salt and pepper on all sides.",
      "Add neutral oil (high smoke point avocado oil) to a pot.",
      "Sear the seasoned short ribs in the pot."
    ]
  },
  {
    "ingredients": [
      { "name": "short ribs", "quantity": null },
      { "name": "ginger", "quantity": null },
      { "name": "garlic", "quantity": null },
      { "name": "green onions", "quantity": null },
      { "name": "shallot", "quantity": null }
    ],
    "steps": [
      "Drop in the short ribs and pack them in, searing in batches if necessary.",
      "Flip the short ribs to get color on both sides. Sear for a couple more minutes.",
      "Slice ginger.",
      "Crush garlic.",
      "Rough chop green onions, reserving some for garnish.",
      "Remove outer layer of skin from the shallot."
    ]
  },
  {
    "ingredients": [
      { "name": "green onions", "quantity": null },
      { "name": "shallot", "quantity": null },
      { "name": "garlic", "quantity": null },
      { "name": "ginger", "quantity": null },
      { "name": "mirin", "quantity": null },
      { "name": "miso", "quantity": null },
      { "name": "short ribs", "quantity": "about six" },
      { "name": "soy sauce", "quantity": null },
      { "name": "dark soy sauce", "quantity": null },
      { "name": "honey", "quantity": null },
      { "name": "star anise", "quantity": "two" },
      { "name": "broth", "quantity": null }
    ],
    "steps": [
      "Pull out seared short ribs and set aside.",
      "Add garlic, shallot, ginger, and green onions to the pot.",
      "Add mirin and deglaze, stirring to lift bits off the bottom.",
      "Add miso and cook it down.",
      "Add soy sauce (hefty amount) and dark soy sauce.",
      "Add honey and two star anise. Stir.",
      "Add short ribs back in.",
      "Add broth.",
      "Cook for a couple of hours."
    ]
  },
  {
    "ingredients": [
      { "name": "short ribs", "quantity": null },
      { "name": "broth", "quantity": null }
    ],
    "steps": [
      "Put the lid on and place in the oven.",
      "Cook for a couple of hours until short ribs are tender.",
      "Remove the short ribs.",
      "Cook down the sauce to get a thick glaze."
    ]
  },
  {
    "ingredients": [
      { "name": "cornstarch slurry", "quantity": null }
    ],
    "steps": [
      "Remove short ribs from pot.",
      "Strain all vegetables and ginger from the broth. Return broth to pot.",
      "Reduce the strained broth into a sauce.",
      "Add cornstarch slurry once the sauce reaches a boil.",
      "Whisk until thickened."
    ]
  },
  {
    "ingredients": [
      { "name": "green onions", "quantity": null },
      { "name": "whipped potatoes", "quantity": null }
    ],
    "steps": [
      "Add short ribs back into the thickened sauce and coat.",
      "Plate two short ribs per person in the center.",
      "Pour extra sauce over the top.",
      "Garnish with green onions.",
      "Serve over whipped potatoes."
    ]
  }
]

// ---------------------------------------------------------------------------
// Reduce prompt candidate (OQ6 draft)
// ---------------------------------------------------------------------------

const REDUCE_PROMPT = `Below are section summaries from a recipe video, in order from first to last. Each summary is a JSON object with "ingredients" and "steps".

Consolidate them into a single complete recipe overview:
- Deduplicate ingredients — keep one entry per ingredient, preferring entries that include a quantity
- Preserve step order across all sections — do not reorder
- Remove exact duplicate steps caused by chunk overlap (same action described identically in two consecutive sections)
- Keep all unique steps even if brief

Return JSON only — no prose, no markdown, no code fences:
{
  "ingredients": [{ "name": "...", "quantity": "..." }],
  "steps": ["step 1...", "step 2..."]
}

Summaries:
${JSON.stringify(MAP_SUMMARIES, null, 2)}`

// ---------------------------------------------------------------------------
// Gemini call
// ---------------------------------------------------------------------------

async function callGemini(prompt) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no response)'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('Reduce prompt:')
  console.log(REDUCE_PROMPT.slice(0, REDUCE_PROMPT.indexOf('\nSummaries:')))
  console.log(`\n[...${MAP_SUMMARIES.length} map summaries passed as JSON array]\n`)
  console.log('Calling Gemini...\n')
  console.log('='.repeat(70))

  const start = Date.now()

  let raw
  try {
    raw = await callGemini(REDUCE_PROMPT)
  } catch (err) {
    console.error('Fatal:', err)
    process.exit(1)
  }

  const ms = Date.now() - start

  console.log(`\nRaw response (${ms}ms):`)
  console.log('-'.repeat(50))
  console.log(raw)
  console.log('\n' + '='.repeat(70))

  // Try parsing
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    console.log(`\nParsed successfully.`)
    console.log(`  Ingredients: ${parsed.ingredients?.length ?? '?'}`)
    console.log(`  Steps:       ${parsed.steps?.length ?? '?'}`)

    console.log('\n--- Ingredients ---')
    for (const ing of parsed.ingredients ?? []) {
      const qty = ing.quantity ? ` (${ing.quantity})` : ''
      console.log(`  • ${ing.name}${qty}`)
    }

    console.log('\n--- Steps ---')
    ;(parsed.steps ?? []).forEach((s, i) => console.log(`  ${i + 1}. ${s}`))
  } catch {
    console.log('\n⚠️  JSON parse failed — raw output above is not valid JSON.')
    console.log('   Will need prompt refinement or post-processing.')
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
