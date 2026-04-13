/**
 * Map prompt evaluation — Honey Miso Short Rib chunks
 *
 * Runs the Phase 1 candidate map prompt against all 6 RCTS demo chunks
 * from RE_rcts_demo_honey_miso.md. Chunks are unstripped (contain [music] noise)
 * matching what the current pipeline would produce before F1 (noise stripping)
 * is implemented.
 *
 * Key evaluations:
 *   Chunk 3 — content-rich (ingredients added to pot): should return useful output
 *   Chunk 4 — pure filler (cook reflects on short ribs): should return empty/near-empty
 *   Chunk 6 — outro ("like, comment, share, subscribe"): should return empty/near-empty
 *
 * Resolves OQ5 from RE_open_questions_chunking.md.
 *
 * RUN:
 *   node --env-file=.env scripts/test-map-prompt.js
 */

const GEMINI_API_KEY = process.env.GOOGLE_AI_KEY
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

if (!GEMINI_API_KEY) {
  console.error('❌ Missing env var: GOOGLE_AI_KEY')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Map prompt candidate (OQ5 recommendation — JSON format)
// ---------------------------------------------------------------------------

const MAP_PROMPT = `Extract only the ingredients and cooking steps from this section of a recipe video transcript. Ignore narrative, commentary, music cues, and sign-off content.

Return JSON only — no prose, no markdown, no code fences:
{
  "ingredients": [{ "name": "...", "quantity": "..." }],
  "steps": ["step description..."]
}

If quantity is not mentioned, set quantity to null.
If no recipe content is present, return { "ingredients": [], "steps": [] }.

Transcript section:
`

// ---------------------------------------------------------------------------
// Honey Miso Short Rib — 6 chunks from RE_rcts_demo_honey_miso.md
// Unstripped: [music] noise present, matching current pipeline output
// ---------------------------------------------------------------------------

const CHUNKS = [
  {
    n: 1,
    note: 'seasoning + start of sear — content-rich',
    text: `[music] [music] All right, guys. So, today I am bringing you the recipe you've been asking me for. Honey miso short rib recipe. [music] Let's go ahead and get it. All right, so I have all of my ingredients here. I have my green onion, my garlic, ginger, star. I have one shellot [music] shallot, not Charlotte. All my other ingredients here. So, the first thing we need to do, we need to take our short ribs, and we need to go ahead and get them seasoned. So, we're just going to do salt and pepper. Doesn't need [music] a lot. And then we're going to sear them. So, we take our salt. I'm just going to add them to the whole bowl. I'll toss them around. No need to do an individual situation. All right. Some black pepper. I like coarse black pepper. Do as you please. And we just want to go ahead and make sure that they're seasoned on all sides. Get in there. Give them a little toss. Also, another thing, [music] if you buy yours at the store and they come with the bone, I like to just remove the bone. Um, it does add a lot of flavor to keep the bone. it'll add to that broth. But I don't know. I just like having more surface area to sear up that's actually [music] meat. It's just simpler. It's easier. Then you're not fighting with a bone and all that. So, so here we go. We have our short ribs. [music] They are seasoned. We're going to go ahead and start searing them in our pot. All right. Let's go ahead and add [music] our neutral oil. So, I have my high smoke point avocado oil.`,
  },
  {
    n: 2,
    note: 'sear continues + veg prep — content-rich',
    text: `to go ahead and start searing them in our pot. All right. Let's go ahead and add [music] our neutral oil. So, I have my high smoke point avocado oil. Add that to the pan. And then we're going to go ahead and drop in our short ribs. All right. We want to get those in there. Pack them in as many as you can. If you have to do it in batches, do what you have to do. Or if you're just making a couple of them, I mean, you can also, you know, All right, so we're getting some color on them. Go ahead and give them all a flip. All right, we're just going to get a little more color on those and then we'll be ready to start our foundation of our miso honey glaze that we're going to be creating. So, we'll give this a couple more minutes to just sear up a bit. All right, so while we're finishing up our sear, let's go ahead and prep our vegetables. So, we're just going to cut our ginger [music] into slices. All of this is going to get strained later. We just want to add that flavor in right now. We'll crush our garlic. That way we can release all of that flavor. So, we're just going to give our green onions a rough chop. And make sure you have enough green onions for later because we're going to be garnishing it up. You know, got to get the vibes. You eat with your eyes first. So, it's important that your food looks good. So, don't use all your green onions throwing them in the pot. All right. Next, we have our shallot. We're just [music] going to take off this outer layer of skin.`,
  },
  {
    n: 3,
    note: 'sauce ingredients added — most content-rich chunk',
    text: `all your green onions throwing them in the pot. All right. Next, we have our shallot. We're just [music] going to take off this outer layer of skin. And we're just going to throw them in like that just to add another layer of a flavor to our overall dish. So now that that's ready, let's go ahead and check our short ribs. All right, so we got some color. So I'm going to go ahead and pull these out and we're going to set them to the side and start building the base of our sauce. So, we have our garlic, we have our shallot, and toss in our ginger, [music] and last and definitely not least, and throw in our green onions. All right, next we're going to take our mirin and we're going to go ahead and delaze. Give it a stir. Get some of those bits and pieces all off the bottom. All right. So, next we're going to take our miso and we're going to add that to our pot and start to cook that down. [music] So, I have about six short ribs. So, I'm going to put a pretty hefty amount. I want to create a pretty good size sauce. Next, we're going to go in [music] with our soy sauce. And we're going to add a pretty hefty amount. And also our dark soy sauce. All right. And last, we have our honey and two star. [music] We'll go ahead and give that up a stir. And this is the foundation of our overall sauce and [music] glaze. And now we're just going to add our short rib back in, add our broth, and we're going to let this cook for a couple of hours. >> [music] >> All right.`,
  },
  {
    n: 4,
    note: 'FILLER — cook reflects on short ribs being luxurious, no recipe steps',
    text: `nd now we're just going to add our short rib back in, add our broth, and we're going to let this cook for a couple of hours. >> [music] >> All right. So, we got our lid on it. We're going to go ahead and put this in our oven now. And we're going to let this cook. And there we have it. Our short ribs will be cooking. [music] You know, like short ribs are one of my favorite things to make. And I'll tell you why. Because they're so luxurious. And [music] I think you associate richness with luxuriousness. They're such like a good fat mouth fill whenever you're having short ribs. And so, you know, when you think about those like really nice date night [music] dinners or, you know, even if you're cooking for yourself, you should have something luxurious. And so, the short [music] ribs are going to cook for a couple of hours and we'll check back in them and finish up this [music] recipe. All right. So, I just checked our short ribs. They are tender. They're ready. [music] So, we're going to go ahead and take them out. I'm going to remove the short rib and then we're going to go ahead and cook down the the sauce so we can get a really nice thick glaze. [music] So, we're going to get this bad boy on out of there. All right, so we're going to go ahead and get our short ribs out. Oh my god, those look beautiful.`,
  },
  {
    n: 5,
    note: 'sauce reduction + cornstarch slurry — content-rich',
    text: `, we're going to get this bad boy on out of there. All right, so we're going to go ahead and get our short ribs out. Oh my god, those look beautiful. So, we're going to get those out and then we need to strain all of those vegetables, the ginger and everything and put that back into our pot because we're going to go ahead and reduce it a bit. turn it into a beautiful sauce. Beautiful sauce for our short ribs. All right. All right. Let's set these aside. All right. So, we have our beautiful, beautiful broth [music] and sauce that is about to be made out of this here. We just want to go ahead and strain all of the vegetables out. All right. So, give that a little shake. That way [music] we can kind of strain all that that good juice out. If you want, you can press the [music] vegetables up against the wire mesh, but sometimes it makes chunks fall in. So, I just choose to just let it strain until it's just a few drops coming at a time. All right. So, now we're going to add that leftover broth to our pot. This is where our beautiful sauce is going to go. Oh, I made a huge [music] mess. But that's that's the name of the game sometimes. We cooking now. So, we got our sauce here. We're going to go ahead and add our corn starch slurry to give it a nice thickness once we get it to a little bit of a boil. [music] And we're going to be ready to start plating this up. All right, our cornstarch goes in. [music] All right, we're just going to give that a whisk. All right, guys.`,
  },
  {
    n: 6,
    note: 'OUTRO — plating + "like comment subscribe", low recipe value',
    text: `g to be ready to start plating this up. All right, our cornstarch goes in. [music] All right, we're just going to give that a whisk. All right, guys. Our sauce is done. We'll do a check here. So, >> this is what we're looking for. See, got a nice thickness to it. And what we're going to do now, I've got some onomi. We're going to add our [music] short rib back in there. Get them nice and coated. And then we're going to go ahead and plate up our short rib. This is going to be perfect. All right. So, we take our short ribs. We're just going to place [music] those right in the center. Two per person. Don't be shy. Then, we're going to take some of that sauce, cuz who doesn't like extra? [music] pour it over the top. All right, we're going to take our garnish [music] of our green onions. This is why I told you guys to save some. And there we have it. [music] We have a beautiful bed of whipped potatoes and our miso honey short rib. And it's ready for a date night coming to you [music] hopefully soon. Or treat yourself. Make some short rib. I swear you're going to love this recipe. Don't forget guys, [music] like, comment, share, and subscribe. And I will see you guys in the next video.`,
  },
]

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
  console.log('Map prompt:')
  console.log(MAP_PROMPT.trim())
  console.log('\nRunning all 6 chunks in parallel...\n')
  console.log('='.repeat(70))

  const start = Date.now()

  const results = await Promise.all(
    CHUNKS.map(async (chunk) => {
      const chunkStart = Date.now()
      try {
        const summary = await callGemini(MAP_PROMPT + chunk.text)
        return { ...chunk, summary, ms: Date.now() - chunkStart, error: null }
      } catch (err) {
        return { ...chunk, summary: null, ms: Date.now() - chunkStart, error: err.message }
      }
    })
  )

  const totalMs = Date.now() - start

  for (const r of results) {
    const label = r.error ? '❌ ERROR' : (r.summary.trim() === '' ? '⚪ EMPTY' : '✅ OUTPUT')
    console.log(`\nChunk ${r.n} — ${r.note}`)
    console.log(`${label} (${r.ms}ms)`)
    console.log('-'.repeat(50))
    if (r.error) {
      console.log(`Error: ${r.error}`)
    } else if (r.summary.trim() === '') {
      console.log('(empty — map prompt filtered this chunk)')
    } else {
      console.log(r.summary.trim())
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log(`Total time: ${totalMs}ms`)
  console.log('\nEvaluation targets:')
  console.log('  Chunk 3 (sauce ingredients) → should have detailed bullet points')
  console.log('  Chunk 4 (filler/narrative)  → should be empty or near-empty')
  console.log('  Chunk 6 (outro)             → should be empty or near-empty')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
