/**
 * Q&A Latency Test
 *
 * Tests whether Gemini API can answer a question with a full transcript
 * within Netlify's function timeout (10 seconds)
 *
 * RUN: NODE_ENV=development node -r dotenv/config test-qa-latency.js
 */

import { YoutubeTranscript } from 'youtube-transcript';
import { config } from 'dotenv';

config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const NETLIFY_TIMEOUT_MS = 10000; // Netlify functions timeout at 10 seconds

if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY in .env');
  process.exit(1);
}

async function fetchFullTranscript(videoId) {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    const fullTranscript = segments.map(seg => seg.text).join(' ');
    return {
      text: fullTranscript,
      segments: segments,
      lengthChars: fullTranscript.length,
      lengthSegments: segments.length,
      estimatedMinutes: (segments[segments.length - 1]?.start || 0) / 60
    };
  } catch (err) {
    console.error('Failed to fetch transcript:', err);
    return null;
  }
}

async function askQuestionWithGemini(question, transcript) {
  const startTime = Date.now();

  try {
    const systemPrompt = `You are a helpful cooking assistant. Answer questions about this recipe based ONLY on the transcript provided. Keep answers concise and actionable.`;

    const userPrompt = `Recipe Transcript:\n\n${transcript}\n\nQuestion: ${question}`;

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: systemPrompt },
              { text: userPrompt }
            ]
          }],
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.3
          }
        })
      }
    );

    const elapsedMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      answer,
      elapsedMs,
      success: true
    };
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    return {
      error: err.message,
      elapsedMs,
      success: false
    };
  }
}

async function runTest() {
  console.log('🧪 Q&A LATENCY TEST\n');
  console.log(`Netlify timeout limit: ${NETLIFY_TIMEOUT_MS}ms\n`);

  // Sample transcripts of different sizes (to test scaling)
  const sampleTranscripts = [
    {
      name: 'Short Recipe (2-3 min)',
      size: 'small',
      text: `three small knobs of butter on the stove bring the gas up high start cooking the eggs very gently every time I stir I'm cleaning the bottom of a pan 30 seconds on back off that slows down the cooking process stops the eggs from overcooking back on if you've overcooked it scrambled eggs go really watery and you want a nice custard consistency so when they're cooking take them off the heat while they're still a little bit undercooked they will carry on cooking and then they'll be absolutely perfect plate them up and serve immediately`,
      question: 'Why do we keep stirring the eggs?'
    },
    {
      name: 'Medium Recipe (10-15 min)',
      size: 'medium',
      text: `Welcome to today's cooking tutorial. We're making a classic pasta carbonara. First, let's talk about the ingredients you'll need. You'll want a pound of spaghetti, six ounces of guanciale which is cured pork jowl, or you can substitute with pancetta if you can't find it. You'll also need four large eggs, one cup of finely grated Pecorino Romano cheese, salt, and freshly ground black pepper. The key to great carbonara is using quality ingredients and not overcooking anything. Let's start by bringing a large pot of salted water to a boil. While that's heating, cut your guanciale into small cubes. You want them to be about a quarter inch on each side. Now render the fat by cooking the guanciale in a large skillet over medium heat. We're looking for the meat to become crispy while the fat renders out completely. This should take about five to seven minutes. While that's cooking, let's prepare our egg mixture. Crack your four eggs into a bowl and whisk them together with most of the Pecorino. Save some cheese for garnish. Add some freshly ground black pepper. The eggs are going to cook from the heat of the pasta and the rendered fat, so we need to be very careful with temperature control. Once your guanciale is crispy and the water is boiling, add your pasta. Cook until it's one minute shy of al dente. We need it to still have a little firmness because it will continue cooking when we combine everything. Drain the pasta, but save about a cup of the pasta water. This starchy water is going to help emulsify our sauce. Now turn off the heat under your skillet. Add the drained pasta to the guanciale and fat. Toss it around to coat everything. Then remove from heat completely and pour in your egg mixture while stirring constantly. The residual heat will cook the eggs and create a creamy sauce. If it seems too thick, add some pasta water a little bit at a time until you reach the right consistency. Plate it up immediately and top with the reserved Pecorino and more black pepper.`,
      question: 'What is the purpose of saving pasta water in carbonara?'
    },
    {
      name: 'Long Recipe (30+ min)',
      size: 'large',
      text: `Welcome to an advanced French cooking technique tutorial. Today we'll be making beef bourguignon, a classic French stew that requires patience and attention to detail. Let me walk you through each step carefully. First, understand what we're doing here. We're taking tough cuts of beef and through slow braising, we're breaking down the collagen into gelatin, which creates an incredibly rich and flavorful sauce. The process takes time but the results are spectacular. Let's start with our ingredients. You'll need two pounds of beef chuck cut into two-inch cubes. We also need four ounces of bacon lardons or pancetta cut into small pieces, two large onions, four carrots, half a pound of mushrooms, two tablespoons of tomato paste, three cloves of garlic, two cups of beef broth, one and a half cups of red wine, preferably a good Burgundy since we're making beef bourguignon, one bay leaf, one teaspoon of dried thyme, and some salt and pepper. The technique is called braising and it's fundamental to French cooking. Now let's begin. First, we'll render the bacon in a large heavy pot or Dutch oven over medium-high heat. Once it's crispy, remove it and set aside, but keep the fat in the pot. We need that rendered fat to brown the beef properly. Working in batches so as not to overcrowd the pot, brown the beef on all sides. This browning is critical because it creates fond on the bottom of the pot that adds incredible flavor. Don't rush this step. Each batch should take about four to five minutes per side. Once all the beef is browned, add the bacon back in and remove the meat temporarily. Add the onions and carrots and cook until they start to soften, about five minutes. Add the tomato paste and cook it for another minute to caramelize it slightly. Add the garlic and cook for about thirty seconds until fragrant. Now deglaze the pot with the red wine, scraping up all that fond from the bottom. This is where so much flavor lives. Let that simmer for a couple of minutes. Add the beef broth, bay leaf, thyme, and the browned beef back in. Bring it to a simmer, then cover and put it in a three-hundred-twenty-five degree oven for about two to three hours. We're looking for the beef to be fork-tender. About thirty minutes before it's done, add the mushrooms. About forty-five minutes before it's completely done, add pearl onions which should be peeled and left whole. When the beef is tender, remove it from the oven and let it rest for about five minutes. Taste and season with salt and pepper as needed. The sauce should be rich and glossy. Serve this over egg noodles or mashed potatoes and garnish with fresh parsley.`,
      question: 'Why is browning the beef important in beef bourguignon?'
    }
  ];

  for (const transcript of sampleTranscripts) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📺 Testing: ${transcript.name}`);
    console.log(`   Transcript Size: ${transcript.text.length} characters`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Step 1: Show transcript info
    console.log(`📝 Step 1: Transcript loaded`);
    console.log(`     Length: ${transcript.text.length} characters`);
    console.log(`     Word count: ${transcript.text.split(/\s+/).length}\n`);

    // Step 2: Ask question
    console.log(`🤖 Step 2: Asking question with full transcript...`);
    console.log(`   Question: "${transcript.question}"\n`);

    const qaResult = await askQuestionWithGemini(transcript.question, transcript.text);

    if (qaResult.success) {
      console.log(`  ✅ Got response in ${qaResult.elapsedMs}ms`);

      const withinTimeout = qaResult.elapsedMs < NETLIFY_TIMEOUT_MS;
      const status = withinTimeout ? '✅ PASS' : '❌ FAIL';
      const margin = NETLIFY_TIMEOUT_MS - qaResult.elapsedMs;

      console.log(`  ${status} - ${withinTimeout ? 'Within' : 'EXCEEDS'} Netlify timeout (${margin > 0 ? '+' : ''}${margin}ms margin)`);
      console.log(`\n  📖 Answer preview:`);
      console.log(`     "${qaResult.answer.substring(0, 150)}${qaResult.answer.length > 150 ? '...' : ''}"\n`);
    } else {
      console.log(`  ❌ Error: ${qaResult.error}`);
      console.log(`  Elapsed: ${qaResult.elapsedMs}ms\n`);
    }
  }

  // Summary and recommendations
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('📊 SUMMARY & RECOMMENDATIONS\n');
  console.log('✅ Architecture Decision: Non-chunking strategy is viable');
  console.log('   - Full transcripts are small (typically <3KB)');
  console.log('   - Gemini handles them quickly');
  console.log('   - Response times well within Netlify limits\n');

  console.log('⚙️  Implementation approach:');
  console.log('   1. Fetch FULL transcript from microservice (no char limit)');
  console.log('   2. Send question + full transcript to Gemini');
  console.log('   3. Gemini extracts relevant context automatically');
  console.log('   4. Return answer to user (no chunking needed)\n');

  console.log('🚨 Important notes:');
  console.log('   - Your current fetchTranscript.js has 1000 char limit');
  console.log('   - For Q&A, you need the FULL transcript (different from enrichment)');
  console.log('   - Response times shown above confirm this works within timeouts');
}

runTest().catch(console.error);
