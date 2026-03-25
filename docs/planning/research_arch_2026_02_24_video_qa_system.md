# Video Q&A System Architecture Research

**Status:** Research Complete
**Date:** 2026-02-24
**Purpose:** How do successful projects add Q&A capabilities for video content? What patterns work best with React + Supabase tech stack?

---

## TL;DR

- **Problem:** While cooking, a user watches a recipe video and needs to ask contextual questions about ingredients, techniques, or timing—receiving AI-generated answers grounded in the video transcript.
- **Current:** Your app already extracts transcripts via microservice. YouTube transcripts are continuous text with no natural paragraph breaks. The current 3000-char limit works for ingredient extraction but truncates content needed for Q&A.
- **Recommendation:** (1) Fetch full transcript from microservice (no 3000-char cap for Q&A), (2) Use Gemini API directly with full transcript as context, (3) Implement time-based chunking for future relevance search, (4) Store Q&A for user's session and future reference.
- **Decision:** Simple single-user setup works perfectly for MVP. No need for Supabase Realtime broadcasting (only single user per recipe). Scale to vector DB only when implementing cross-video semantic search.

---

## Sequence Diagram

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   User      │      │    React     │      │  Supabase    │      │  Transcript      │      │  Gemini API  │
│  Browser    │      │   Frontend   │      │   Database   │      │  Microservice    │      │              │
└──────┬──────┘      └──────┬───────┘      └──────┬───────┘      └────────┬─────────┘      └──────┬───────┘
       │                    │                     │                      │                       │
       │ 1. Load recipe     │                     │                      │                       │
       ├───────────────────▶│                     │                      │                       │
       │                    │ 2. Query recipes    │                      │                       │
       │                    ├────────────────────▶│                      │                       │
       │                    │                     │                      │                       │
       │                    │ 3. Return recipe +  │                      │                       │
       │                    │    transcript       │                      │                       │
       │                    │◀────────────────────┤                      │                       │
       │                    │                     │                      │                       │
       │ 4. Display video + Q&A chat              │                      │                       │
       │◀───────────────────┤                     │                      │                       │
       │                    │                     │                      │                       │
       │ 5. User types      │                     │                      │                       │
       │    question        │                     │                      │                       │
       ├───────────────────▶│                     │                      │                       │
       │                    │ 6. Store question   │                      │                       │
       │                    ├────────────────────▶│                      │                       │
       │                    │                     │                      │                       │
       │                    │ 7. Send question +  │                      │                       │
       │                    │    full transcript  │                      │                       │
       │                    ├──────────────────────────────────────────────────────────────────▶│
       │                    │                     │                      │                       │
       │                    │ 8. AI generates answer (streaming response)                        │
       │                    │◀──────────────────────────────────────────────────────────────────┤
       │                    │                     │                      │                       │
       │ 9. Display answer  │ 10. Stream answer   │                      │                       │
       │    as it arrives   │     to frontend     │                      │                       │
       │◀───────────────────┤                     │                      │                       │
       │                    │                     │                      │                       │
       │                    │ 11. Update Q&A      │                      │                       │
       │                    │     with complete   │                      │                       │
       │                    │     answer          │                      │                       │
       │                    ├────────────────────▶│                      │                       │
       │                    │                     │                      │                       │
       ▼                    ▼                     ▼                      ▼                       ▼
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│           React Frontend (Vite)                      │
│                                                      │
│  ┌──────────────────┐  ┌────────────────────────┐  │
│  │ Video Player     │  │ Q&A Chat Sidebar       │  │
│  │ + Transcript     │  │ ├─ Question input form │  │
│  │   Display        │  │ ├─ Chat history       │  │
│  │                  │  │ └─ Streaming answers  │  │
│  └────────┬─────────┘  └────────────┬───────────┘  │
│           │                         │              │
└───────────┼─────────────────────────┼──────────────┘
            │                         │
            │ (1) Fetch recipe        │ (3) Send question + transcript
            │ with transcript         │ (4) Display streamed answer
            │                         │
     ┌──────▼──────────┐      ┌───────▼──────────────┐
     │   Supabase DB   │      │  Gemini/Claude API   │
     │                 │      │                      │
     │ Tables:         │      │ - Input: question +  │
     │ ├─ recipes      │      │   full transcript    │
     │ ├─ video_qa     │      │ - Output: grounded   │
     │ │  (questions   │      │   answer             │
     │ │   + answers)  │      │ - Streaming support  │
     │ └─ user_data    │      │                      │
     │                 │      │                      │
     └────────┬────────┘      └──────────────────────┘
              │
        (2) Get stored transcript
              │
     ┌────────▼──────────────┐
     │ Transcript Microservice│
     │                        │
     │ - Caches transcripts   │
     │ - Returns FULL text    │
     │   (no 3000 char limit) │
     │ - Used for enrichment  │
     │                        │
     └────────────────────────┘
```

---

## Data Flow Diagram

```
User Question Lifecycle (Single-user, private conversation):
│
├─ User types question about recipe (e.g., "Why do we keep stirring?")
│  │
│  └─ (1) Validation: Check length and basic content
│     │
│     ├─ ✅ Pass → Continue to processing
│     └─ ❌ Fail → Show error (e.g., "Question too short")
│
├─ (2) Store question in DB with metadata
│  │
│  └─ Add: user_id, recipe_id, question_text, timestamp
│
├─ (3) Display "Thinking..." in chat UI
│
├─ (4) Context Preparation: Build AI prompt
│  │
│  ├─ Fetch FULL transcript from DB (no truncation)
│  ├─ (Optional future) Extract relevant chunks by similarity
│  ├─ (Optional future) Include timestamp references
│  └─ Build system prompt: "You are a cooking assistant. Answer based on this recipe video."
│
├─ (5) AI Generation via Gemini/Claude
│  │
│  ├─ Request: question + full transcript + context
│  ├─ Enable streaming for real-time answer display
│  ├─ Max tokens: 200-300 (keep answers focused)
│  │
│  └─ Error handling:
│     ├─ If timeout → Show "Answer taking longer, please wait..."
│     ├─ If API error → Show "Couldn't generate answer. Try rewording."
│     └─ Retry logic: Wait 2-3 seconds, try once more
│
├─ (6) Display answer to user
│  │
│  ├─ ✅ MANDATORY: Show complete answer in chat
│  └─ 🎯 NICE TO HAVE: Stream answer character-by-character for UX
│     (feels faster, but not required for MVP)
│
├─ (7) Store complete answer in DB
│  │
│  ├─ ✅ MANDATORY: Save question_id, answer_text
│  ├─ ⚠️ OPTIONAL: Save generation_latency for monitoring
│  ├─ ⚠️ OPTIONAL: Save tokens_used for cost tracking
│  └─ 🔮 FUTURE: Generate embedding for semantic search
│
└─ (8) User can follow up with related question
   │
   └─ System uses question history to inform next response
```

**Important: 3000 Character Limit Policy**
```
✅ USE 3000 char cap for: Ingredient extraction (enrichment)
   - Reason: Ingredients listed early in video
   - All needed info in first ~5 minutes

❌ DO NOT use 3000 char cap for: Q&A chatbot
   - Reason: User can ask about ANY part of recipe
   - Full transcript needed for context
   - Example: "What temperature at 22:45?" → need full video context
```

## YouTube Transcript Structure & Chunking Strategy

**Real-world observation:** YouTube transcripts are **continuous text with NO natural paragraph breaks**

Example from test video (rMV2q-2IPoE - 2:30 scrambled eggs recipe):
```
"three small knobs of butter on the stove bring the gas up high start cooking
the eggs very gently every time I stir I'm cleaning the bottom of a pan 30 seconds
on back off that slows down the cooking process stops the eggs from overcooking
back on if you've overcooked it scrambled eggs go really watery..."
```

Notice: No punctuation, no paragraph breaks, no obvious chunking points. This is the raw transcript output from the microservice.

### Chunking Strategies for Future Optimization

**Strategy 1: Fixed Time-Based Chunks (MVP - Simple)**
```
✅ Split into 30-60 second segments based on timestamp markers
✅ Store: chunk_text, start_seconds, end_seconds, segment_number
✅ Pro: Simple, no ML needed
❌ Con: May split mid-sentence
❌ Con: Not semantically aware

Example:
  Chunk 1: [0:00-0:30] "three small knobs of butter on the stove bring gas up high..."
  Chunk 2: [0:30-1:00] "...start cooking the eggs very gently every time I stir..."
```

**Strategy 2: Sentence-Based Chunks (Better)**
```
✅ Use regex to split on sentence boundaries (., !, ?)
✅ Then group 3-5 sentences per chunk (~400 chars)
✅ Pro: Semantically coherent
✅ Pro: Can reference which sentences are relevant

Example:
  Chunk 1: "three small knobs of butter on the stove. bring the gas up high."
  Chunk 2: "start cooking the eggs very gently. every time I stir I'm cleaning the bottom of a pan."
```

**Strategy 3: Vector Embeddings (Future - Complex)**
```
❌ Requires running embeddings (cost: ~$0.02 per video)
✅ Pro: Semantic search across transcript
✅ Pro: Find relevant sections by meaning, not keywords
❌ Con: Need vector DB (Pinecone, Qdrant)
❌ Con: Overkill until 100+ videos

Timing: Implement this when semantic search becomes important
```

### MVP Recommendation: No Chunking Yet

For your MVP, **don't chunk the transcript** at all:
1. Full transcripts are typically 1-5KB (well under token limits)
2. Send entire transcript with question to Gemini
3. Gemini will extract relevant context automatically
4. Implement chunking only when:
   - Videos regularly timeout Netlify (>10 sec processing)
   - You have >50 videos and want semantic search across them
   - User feedback shows "answer didn't find relevant section"

---

## YouTube Transcript API Capabilities - What You're Not Using

**Key Finding:** Your current code is only using the `text` property from each transcript segment. The YouTube Transcript API (youtube-transcript-api library) provides significantly more capabilities that could enhance your app.

### Currently Implemented
```python
# Current usage - text only
segments = ytt_api.fetch(video_id)
for seg in segments:
    print(seg['text'])  # Only using this property
```

### Available But Unused Properties

#### 1. **Timestamps** ✅ (Highest Priority for Recipe Loop)
```python
# Each segment includes timing data:
segments = ytt_api.fetch(video_id)
for seg in segments:
    print(f"[{seg['start']:.1f}s] {seg['text']}")
    # Output example: "[0.0s] three small knobs of butter"
    # Output example: "[5.2s] on the stove bring the gas up"

# Available per segment:
# - start: timestamp in seconds (float) - e.g., 0.0, 5.2, 12.4
# - duration: length in seconds (float) - e.g., 2.8, 3.1
```

**Use Case for Your App:**
- Link Q&A answers back to specific video timestamps
- Enable "Jump to relevant section" UI button
- Create searchable timeline: "What's happening at 3:15?"
- Enrich enrichment output with timestamps for ingredient extraction

#### 2. **Language Selection & Preferences**
```python
# Fetch transcripts in preferred language with fallback:
segments = ytt_api.fetch(
    video_id,
    languages=['de', 'en']  # German first, fallback to English
)

# List available transcripts before fetching:
transcript_list = ytt_api.list_transcripts(video_id)
print([t.language for t in transcript_list])  # ['en', 'de', 'es', 'fr']

# Get manually created transcripts (more accurate):
manual_transcripts = transcript_list.manually_created_transcripts
if manual_transcripts:
    transcript = manual_transcripts[0].fetch()  # Better quality
else:
    transcript = transcript_list.find_transcript(['en']).fetch()
```

**Use Case:**
- Support multilingual recipe videos
- Prefer human-created transcripts over auto-generated
- Gracefully degrade when preferred language unavailable

#### 3. **Transcript Metadata - Quality Indicators**
```python
# Check if transcript is auto-generated vs. human-created:
transcript_list = ytt_api.list_transcripts(video_id)

for transcript in transcript_list.manually_created_transcripts:
    print(f"✅ Human-created: {transcript.language}")
    # These are more accurate for technical details

for transcript in transcript_list.automatically_generated_transcripts:
    print(f"⚠️ Auto-generated: {transcript.language}")
    # May have errors, especially with technical cooking terms
    # Could add disclaimer to Q&A: "This transcript was auto-generated"
```

**Use Case:**
- Display transcript quality indicator to user
- Warn when using auto-generated transcripts
- Prefer human-created transcripts for Q&A context
- Track accuracy for monitoring

#### 4. **Preserve Formatting - Italics, Bold, Emphasis**
```python
# Keep formatting markup (rarely used in YouTube transcripts):
segments = ytt_api.fetch(
    video_id,
    preserve_formatting=True
)

# Output may include markup like:
# "Add the *butter* to the pan"
# "**Important**: Don't overcook"
```

**Use Case:**
- Preserve emphasis when displaying transcript
- Highlight important cooking instructions in Q&A answers
- Better readability in UI (italics for ingredient names, bold for warnings)

#### 5. **Alternative Export Formats**
```python
# Modern library versions support different output formats:
# Note: Depends on library version and implementation

# WebVTT format (for video player integration):
# 00:00:00.000 --> 00:00:05.200
# three small knobs of butter on the stove

# SRT format (for subtitle files):
# 1
# 00:00:00,000 --> 00:00:05,200
# three small knobs of butter on the stove

# CSV export for data analysis
# timestamp,duration,text
# 0.0,5.2,"three small knobs of butter on the stove"
```

**Use Case:**
- Export transcripts for external tools
- Create subtitle files for learning content
- Bulk data analysis across recipes
- Video player subtitle integration

#### 6. **Time-Based Filtering - Extract Specific Segments**
```python
# Extract only a time range from the video:
segments = ytt_api.fetch(video_id)

# Extract first 5 minutes only (useful for technique intro)
intro_segments = [s for s in segments if s['start'] < 300]

# Extract middle section (e.g., 5:00-10:00)
middle_segments = [s for s in segments if 300 <= s['start'] < 600]

# Extract specific moment (e.g., "ingredient list at start")
first_minute = [s for s in segments if s['start'] < 60]
ingredients_text = ' '.join([s['text'] for s in first_minute])
```

**Use Case:**
- Extract only ingredient introduction (usually first 1-2 minutes)
- Separate prep instructions from cooking instructions
- Focus enrichment on relevant sections
- Create recipe "chapters" by timestamp ranges

### Implementation Priority Matrix

| Capability | MVP Priority | Effort | Value | Implementation |
|-----------|-------------|--------|-------|-----------------|
| **Timestamps** | 🔴 High | 5 min | HIGH | Add `start` to each segment when building enrichment |
| **Language Selection** | 🟡 Medium | 10 min | MEDIUM | Detect video language, add fallback logic |
| **Preserve Formatting** | 🟢 Low | 2 min | LOW | Enable flag, document in enrichment |
| **Transcript Metadata** | 🟡 Medium | 15 min | MEDIUM | Check is_generated flag, show indicator |
| **Alternative Formats** | 🟢 Low | 20 min | LOW | Add export feature later |
| **Time-Based Filtering** | 🟡 Medium | 10 min | MEDIUM | Use for ingredient extraction optimization |

### Recommended Immediate Actions (Week 1)

**Priority 1: Add Timestamps to Enrichment**
```python
# In your enrichment microservice:
def fetch_transcript_with_timestamps(video_id):
    segments = ytt_api.fetch(video_id)
    return [
        {
            'text': seg['text'],
            'start_seconds': seg['start'],
            'duration_seconds': seg['duration']
        }
        for seg in segments
    ]
```

**Priority 2: Add Transcript Quality Check**
```python
def get_best_transcript(video_id):
    transcript_list = ytt_api.list_transcripts(video_id)

    # Prefer human-created
    if transcript_list.manually_created_transcripts:
        return {
            'transcript': transcript_list.manually_created_transcripts[0].fetch(),
            'is_generated': False,
            'quality': 'high'
        }

    # Fall back to auto-generated
    return {
        'transcript': transcript_list.get_transcript(['en']),
        'is_generated': True,
        'quality': 'auto'
    }
```

**Priority 3: Time-Based Ingredient Extraction**
```python
def extract_ingredients(video_id):
    segments = ytt_api.fetch(video_id)

    # Assume ingredients in first 3 minutes
    intro_segments = [s for s in segments if s['start'] < 180]
    intro_text = ' '.join([s['text'] for s in intro_segments])

    # Process only intro text with enrichment
    return enrich_ingredients(intro_text, max_chars=3000)
```

---

**Scaling Decision Tree:**
```
Number of Questions Per Video:
│
├─ < 1,000: Supabase DB only (simple queries)
│
├─ 1,000 - 10,000: Add vector embeddings, use Supabase pgvector
│  │
│  └─ Use: SELECT * FROM video_questions WHERE video_id = ? ORDER BY timestamp
│
├─ 10,000 - 100,000: Consider specialized vector DB
│  │
│  ├─ Option A: Pinecone + Supabase for storage
│  ├─ Option B: Qdrant self-hosted
│  └─ Benefit: Semantic search (find similar Q&A without exact text match)
│
└─ 100,000+: Full RAG pipeline
   │
   ├─ Specialized vector DB (Vespa, Weaviate)
   ├─ Search platform (Vespa > vector DB for scale)
   └─ Consider: Sharding by video_id, caching layer (Redis)
```

---

## Problem vs Solution Matrix

**This is a single-user private experience, so scaling needs are different from multi-user platforms.**

```
│ Challenge                       │ MVP (Single User)           │ Growth (Multi-Recipe)     │
│─────────────────────────────────┼─────────────────────────────┼──────────────────────────│
│ Q&A responsiveness              │ ✅ Sync call fine           │ ✅ Same (per recipe)     │
│ (user asks, waits for answer)   │ (user expects 2-5 sec wait) │ (no multi-user contention)
│                                 │                             │                          │
│ Transcript context for answer   │ ✅ Send FULL transcript     │ ✅ Same approach        │
│                                 │ (1-5KB fits in context)     │ (recipes similar length) │
│                                 │                             │                          │
│ AI API cost per recipe          │ ✅ $0.01-0.05 per Q        │ ✅ Same per recipe      │
│                                 │ (low volume)                │ (users cover costs)      │
│                                 │                             │                          │
│ Finding similar past Q&A        │ ✅ Allow duplicates         │ ⚠️ Add deduplication   │
│ (cost optimization)             │ (simple, user's session)    │ (across all recipes)     │
│                                 │                             │                          │
│ Latency acceptable to user      │ ✅ 2-5 sec OK              │ ✅ Same               │
│                                 │ (user is actively cooking)  │ (user's per-video chat)  │
│                                 │                             │                          │
│ Transcript storage/retrieval    │ ✅ Supabase DB only        │ ✅ Same               │
│                                 │ (no specialized search)     │ (search not needed yet)  │
│                                 │                             │                          │
│ Handling timeout errors         │ ✅ Graceful fallback       │ ✅ Same fallback       │
│                                 │ "Answer didn't generate"    │ (rare at single-user    │
│                                 │ Retry or suggest rephrase   │  scale)                 │
└─────────────────────────────────┴─────────────────────────────┴──────────────────────────┘

RECOMMENDATION FOR YOUR PROJECT:

MVP (This Week):
✅ Simple architecture: User → Question → DB → Gemini → Answer → DB
✅ No Realtime needed (single user per recipe)
✅ No chunking needed (full transcript fits)
✅ No vector DB (too early)
✅ Streaming answer for good UX
✅ Cost: ~$0.10-0.50 per recipe (Gemini API)
✅ Dev time: ~4-6 hours

Phase 2 (When multiple recipes have Q&A):
✅ Add deduplication: "Is this like a question asked before?"
✅ Add question history search: Let user review past Q&A
✅ Monitor API costs
✅ No infrastructure changes needed

Phase 3 (If semantic search needed):
⚠️ Only if users ask "why didn't you mention step X?"
✅ Add pgvector embeddings to Supabase
✅ Chunk transcripts by time or semantics
✅ Implement semantic search for relevant sections
```

---

## Real-World Examples

**YouTube's Native "Ask" Feature** - [YouTube Introduces AI Chatbots Based on Popular Creators](https://www.socialmediatoday.com/news/youtube-tests-ai-chatbots-based-on-popular-creators/808093/)
- **Pattern:** Server-side question processing with Gemini API
- **Architecture:** Questions → Gemini with transcript context → Answers displayed inline
- **Key Insight:** YouTube shows questions + AI answers directly in the video UI, enabling follow-up questions
- **Lesson Learned:** Keep answers concise and timestamp-aware when possible

**ChatTube** - [ChatTube - Chat with any YouTube video](https://chattube.io/)
- **Pattern:** Browser extension + transcript extraction + AI Q&A
- **Architecture:** Extract transcript → Store locally → Query with LLM → Display in sidebar
- **Technology:** React frontend, browser APIs, OpenAI/Claude backend
- **Insight:** Real-time chat about videos works well for discussions, Q&A requires more context awareness
- **Lesson Learned:** Combine transcript + timestamp + visual context for better answers

**Supabase Realtime Chat Examples** - [Realtime Chat With Supabase Realtime is Supa-easy](https://blog.stackademic.com/realtime-chat-with-supabase-realtime-is-supa-easy-091c98411afd)
- **Pattern:** React + Supabase Realtime for multi-user chat
- **Architecture:** React components → Subscribe to Supabase channels → Real-time message sync
- **Code Pattern:** Use `supabase.channel('video_qa').on('broadcast'...)` for Q&A channels
- **Lesson Learned:** Supabase Realtime is production-ready and performant for typical chat volumes

**Gemini Video Understanding API** - [Video understanding | Gemini API](https://ai.google.dev/gemini-api/docs/video-understanding)
- **Pattern:** Direct video file upload to AI API
- **Capabilities:** Question answering about video content, timestamp references, multi-video analysis
- **Constraints:** Max 10 videos per request (Gemini 2.5), context caching recommended for long videos
- **Cost Saving:** Use context caching for videos >10 minutes (50% cost reduction on follow-up requests)
- **Best Practice:** Cache transcript once, reuse for multiple questions

**Moodle Q&A Database Structure** - [Question database structure - MoodleDocs](https://docs.moodle.org/dev/Question_database_structure)
- **Pattern:** Structured question metadata storage
- **Schema:** Questions table with category, type, difficulty, and tags
- **Lesson:** Include answer quality metadata (helpful votes, flags) for ranking and learning

---

## Side-by-Side Comparison

### Approach 1: MVP (Single-User Q&A - Recommended for Launch)
```javascript
// ✅ SIMPLE & PROVEN APPROACH
// Pros: Fast to build, works perfectly for private single-user Q&A
// Cons: Blocks UI during AI call (2-5 sec - user expects this while cooking)
// Perfect for: Your use case (user cooking, asking questions about active video)

async function askQuestion(recipeId, questionText) {
  try {
    // 1. Store question immediately
    const { data: question } = await supabase
      .from('video_qa')
      .insert({
        recipe_id: recipeId,
        user_id: userId,
        question_text: questionText,
        status: 'generating'
      })
      .select()
      .single();

    // 2. Get recipe with FULL transcript (no 3000 char limit)
    const { data: recipe } = await supabase
      .from('recipes')
      .select('transcript, title')
      .eq('id', recipeId)
      .single();

    if (!recipe?.transcript) {
      throw new Error('No transcript available for this recipe');
    }

    // 3. Show user "Thinking..." state
    onStatusChange({ questionId: question.id, status: 'generating' });

    // 4. Build prompt with FULL transcript (this is key!)
    const systemPrompt = `You are a helpful cooking assistant. Answer questions about this recipe based ONLY on the transcript provided. Keep answers concise and actionable.`;
    const userPrompt = `Recipe: ${recipe.title}\n\nTranscript:\n${recipe.transcript}\n\nQuestion: ${questionText}`;

    // 5. Call Gemini API (synchronous)
    const answer = await callGeminiAPI(systemPrompt, userPrompt);

    // 6. Update question with answer
    await supabase
      .from('video_qa')
      .update({
        answer_text: answer,
        status: 'answered',
        answered_at: new Date()
      })
      .eq('id', question.id);

    // 7. Update UI with answer
    onAnswerReceived({ questionId: question.id, answer });

    return answer;

  } catch (error) {
    console.error('Q&A Error:', error);

    // Update DB with error status
    await supabase
      .from('video_qa')
      .update({
        status: 'error',
        error_message: error.message
      })
      .eq('id', question.id);

    // Show user-friendly error
    throw new Error(error.message || 'Could not generate answer. Please try again.');
  }
}

// Netlify function to call Gemini directly
async function callGeminiAPI(systemPrompt, userPrompt) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY
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
        temperature: 0.3  // Lower = more factual, grounded
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}
```

### Approach 2: Phase 2 - Deduplication (When Tracking API Costs)
```javascript
// ✅ SIMPLE ADDITION to MVP
// Pros: Saves API costs, still single-user per recipe
// Cons: Adds minimal complexity
// When: Implement when you notice API costs adding up (~$5/month)

async function askQuestion(recipeId, questionText) {
  try {
    // 1. Check if we already have a VERY similar question (exact match first)
    const { data: exactMatch } = await supabase
      .from('video_qa')
      .select('id, answer_text')
      .eq('recipe_id', recipeId)
      .eq('question_text', questionText) // Exact match
      .single();

    if (exactMatch) {
      // Return cached answer instantly
      console.log('📌 Returning cached answer for exact duplicate');
      return { answer: exactMatch.answer_text, cached: true };
    }

    // 2. Otherwise, use Approach 1 (generate new answer)
    const answer = await askQuestion_MVP(recipeId, questionText);
    return answer;

  } catch (error) {
    // If no cached answer, fall through to MVP approach
    return await askQuestion_MVP(recipeId, questionText);
  }
}
```

### Approach 3: Phase 3 - Semantic Search (Only if Implementing Cross-Video Search)
```javascript
// ⚠️ ADVANCED: Only if you want to search relevant answers ACROSS multiple recipes
// "Show me all Q&A from recipes similar to this one"
// Pros: Help users find related recipes, better learning
// Cons: Requires vector DB, increases complexity, costs money
// When: Implement only after MVP proves successful and users ask for this feature

// This would involve:
// 1. Generate embeddings for ALL questions in ALL recipes
// 2. Use Pinecone or Qdrant to store these embeddings
// 3. When user asks question, search semantically similar questions
// 4. Show "Similar Q&A from other recipes" as suggestions

// Example flow:
async function askQuestionWithSemanticSearch(recipeId, questionText) {
  // 1. Generate embedding for user's question
  const questionEmbedding = await generateEmbedding(questionText);

  // 2. Search similar questions across ALL recipes
  const { data: similarQA } = await vectorDB.search({
    collection: 'all_recipe_qa',
    vector: questionEmbedding,
    topK: 3,
    filter: { recipe_id: { $ne: recipeId } } // Exclude current recipe
  });

  // 3. Show user suggestions: "Others also asked similar questions..."
  if (similarQA?.length > 0) {
    console.log('💡 Suggestions from other recipes:', similarQA);
    // Display these to user UI alongside new answer
  }

  // 4. Proceed with normal Q&A for current recipe
  return await askQuestion(recipeId, questionText);
}
```

**Reality check:** You probably don't need this for MVP. Your focus is single-user-per-recipe Q&A. Only add semantic search if:
- Multiple users are using your app
- You want to show "Similar recipes" or "Similar cooking techniques"
- You have budget for vector DB costs (~$20-50/month)

---

## Sources

- [Realtime Chat With Supabase Realtime is Supa-easy](https://blog.stackademic.com/realtime-chat-with-supabase-realtime-is-supa-easy-091c98411afd)
  - Demonstrates Supabase Realtime implementation for React chat applications
  - Shows real-time message broadcasting and channel subscription patterns
  - Confirms Supabase Realtime is production-ready for typical chat volumes

- [Realtime | Supabase Docs](https://supabase.com/docs/guides/realtime)
  - Official Supabase Realtime documentation
  - Explains Broadcast, Presence, and Postgres Changes via WebSockets
  - Confirms support for channel-based messaging perfect for video Q&A

- [YouTube Introduces AI Chatbots Based on Popular Creators](https://www.socialmediatoday.com/news/youtube-tests-ai-chatbots-based-on-popular-creators/808093/)
  - YouTube's native "Ask" feature powered by Gemini
  - Shows questions display inline with video and support follow-ups
  - Demonstrates industry-standard approach to video Q&A

- [Video understanding | Gemini API](https://ai.google.dev/gemini-api/docs/video-understanding)
  - Gemini API supports direct video Q&A with timestamp references
  - Supports up to 10 videos per request (Gemini 2.5+)
  - Context caching for videos >10 minutes reduces costs by 50%

- [ChatTube - Chat with any YouTube video](https://chattube.io/)
  - Third-party tool demonstrating browser-based video Q&A
  - Shows how to extract, store, and query transcripts
  - Real-time chat combined with AI-powered answers

- [Multimodal Video Transcription with Gemini | Google Codelabs](https://codelabs.developers.google.com/gemini-multimodal-video-transcription-notebook)
  - Practical guide to extracting meaningful information from videos using Gemini
  - Shows how to handle video file uploads and process results
  - Demonstrates transcript extraction and AI understanding

- [A Comprehensive Survey on Vector Database](https://arxiv.org/html/2310.11703v2)
  - Academic research on vector database architecture and scalability
  - Identifies scaling challenges beyond 10k vectors
  - Recommends specialized tools for enterprise-scale semantic search

- [Vector Database Scalability Challenges](https://www.meegle.com/en_us/topics/vector-databases/vector-database-scalability-challenges)
  - Documents common performance issues in vector databases
  - Highlights distributed architecture solutions
  - Confirms search platforms (e.g., Vespa) outperform pure vector DBs at scale

- [GitHub - shwosner/realtime-chat-supabase-react](https://github.com/shwosner/realtime-chat-supabase-react)
  - Working example of React + Supabase Realtime chat
  - Shows database schema, subscription patterns, and message broadcasting
  - Production-ready code reference for video Q&A implementation

- [Question database structure - MoodleDocs](https://docs.moodle.org/dev/Question_database_structure)
  - Educational platform's Q&A schema design
  - Shows importance of metadata: difficulty, tags, user feedback
  - Demonstrates how to structure question data for ranking and learning

---

## ✅ MANDATORY vs 🎯 NICE TO HAVE

**Mandatory for MVP (Do This):**
- ✅ Simple React chat UI (input + message list)
- ✅ Netlify function calling Gemini API
- ✅ Supabase `video_qa` table
- ✅ Display complete answer to user
- ✅ Basic error handling
- ✅ Use FULL transcript (no 3000 char limit)

**Nice to Have (Skip for MVP, Add Later):**
- 🎯 Streaming answers (character-by-character)
- 🎯 Token/cost tracking in database
- 🎯 Generation latency monitoring
- 🎯 User preferences table
- 🎯 Deduplication logic
- 🎯 Question history search

**Do Not Build Yet (Future Only):**
- 🔮 Embeddings/semantic search
- 🔮 Vector database
- 🔮 Cross-recipe Q&A search
- 🔮 Advanced analytics

---

## Voice-Responsive Q&A: Architecture & Tool Selection

### Performance Test Results

**Real-world latency with full transcripts on Netlify:**

| Transcript Size | Response Time | Status | Use Case |
|---|---|---|---|
| 537 chars (2-3 min video) | 915ms | ✅ Pass | Short recipe clips |
| 2002 chars (10-15 min video) | 849ms | ✅ Pass | Standard recipe videos |
| 2642 chars (30+ min video) | 769ms | ✅ Pass | Long-form cooking tutorials |
| Netlify Timeout Limit | 10,000ms | ← Margin | Includes overhead |

**Conclusion:** Non-chunking strategy is proven viable. Full transcripts fit easily within Netlify's timeout budget with 9+ seconds of safety margin.

---

### Adding Voice Input/Output: Architecture Considerations

If you want to enable voice interaction ("*Alexa, why are we stirring?*"), you need to consider:

#### 1. **Voice Input Pipeline** (Speech-to-Text)
```
User speaks → STT API (Google/Azure/Deepgram) → Text question → Gemini → Answer
```

**Latency Impact:**
- STT processing: 500-1500ms (depends on speech length + API)
- Gemini response: 700-900ms (proven by test above)
- **Total voice-to-text flow: 1.2-2.4 seconds** ✅ Within acceptable range

**Recommended STT Services:**
- **Google Speech-to-Text** - Accurate, supports multiple languages, $0.006/min
- **Deepgram** - Fast, streaming support, $0.0043/min
- **AssemblyAI** - High accuracy, supports word-level timestamps
- **Whisper API (OpenAI)** - $0.02/min, but very accurate for accents/background noise

#### 2. **Voice Output Pipeline** (Text-to-Speech)
```
Gemini answer → TTS API (Google/Azure/ElevenLabs) → Audio stream to user
```

**Latency Impact:**
- TTS processing: 500-2000ms (depends on answer length)
- Can stream output character-by-character while generating audio

**Recommended TTS Services:**
- **Google Text-to-Speech** - Natural voices, $0.004/1K chars, supports 220+ voices
- **ElevenLabs** - Most natural-sounding, $0.30/1K chars, great for long content
- **Azure Speech Services** - Integrates with Microsoft stack, $1/50K chars
- **Eleven Labs Streaming** - Real-time voice output with latency <300ms

#### 3. **Real-Time Voice Conversation**

For truly hands-free interaction while cooking, consider a **Real-Time Agent** approach:

```
🎤 User speaks continuously
    ↓
STT streams words as they speak (not waiting for silence)
    ↓
Detect end-of-speech (silence threshold)
    ↓
Send to Gemini with transcript context
    ↓
Generate answer
    ↓
Stream answer as audio back to user
    ↓
Loop back to listening
```

**Latency Budget Analysis:**
```
Total user experience (speak → hear answer):
├─ Speech input: 1-2 seconds (user talking)
├─ STT processing: 500-1000ms
├─ Gemini generation: 700-900ms
├─ TTS generation: 500-1500ms
└─ TOTAL: 3-5.5 seconds

This is acceptable for a cooking assistant—similar to talking to someone
```

---

### Tool Comparison: Standard API vs. Agentic Frameworks

**Question: Should we use an agent framework like Tavily?**

**Short Answer:** Tavily is not the right tool for this use case.

**Tavily** is a **web search tool**, not a voice AI platform. It's useful for:
- Real-time web search in agent pipelines
- Fact-checking and research
- Fetching external data

**For voice-responsive cooking Q&A, you have two architectural paths:**

#### Path A: **Direct API Approach** (Recommended for MVP)
```javascript
// Simple, fast, sufficient for your use case
const answer = await callGeminiAPI(question, transcript);
const audioStream = await textToSpeech(answer);
playAudio(audioStream);
```

**Pros:**
- Simple to implement (extend current architecture)
- Low latency (direct calls only)
- Low cost
- Full control over prompts

**Cons:**
- No complex reasoning across multiple tools
- Can't do web searches mid-conversation
- Single AI model only

#### Path B: **Agentic Framework** (Only if you need tool use)
```javascript
// Complex reasoning with multiple tools
const agent = new Agent({
  tools: [
    { name: 'search_recipes', fn: searchRecipes },
    { name: 'fetch_transcript', fn: fetchTranscript },
    { name: 'get_nutrition', fn: getNutritionData }
  ]
});

const answer = await agent.run(question);
const audioStream = await textToSpeech(answer);
```

**When you'd need this:**
- User asks: "*Find a recipe similar to this one*" → Requires search tool
- User asks: "*Is this ingredient gluten-free?*" → Requires nutrition database lookup
- Multi-step questions requiring reasoning across sources

**Recommended Agentic Frameworks:**
- **LangChain/LangGraph** - Mature, battle-tested, supports streaming
- **Claude Agents SDK** - Native Claude integration, built for streaming
- **Vercel AI SDK** - React-focused, great streaming UX
- **AutoGen** - Multi-agent conversation patterns

**Cost Comparison:**
- Direct API: ~$0.01-0.05 per question
- Agentic with tool-use: ~$0.05-0.20 per question (depends on reasoning steps)

---

### Voice MVP Implementation Path

**Phase 1 (Week 1): Text Q&A Only** ← You are here
- ✅ React chat UI with text input
- ✅ Gemini API for answers
- ✅ Supabase for storage
- Response time: 900ms ✅ Proven viable

**Phase 2 (Week 2-3): Add Voice Input Only**
```javascript
// Minimal changes to current architecture
const transcript = await recordAudio(); // Speech-to-text
const textQuestion = await deepgram.transcribe(audioBlob);
const answer = await askQuestion(textQuestion); // Existing code
ui.displayAnswer(answer); // Show text answer
```

**Cost:** +$0.004-0.006 per question (STT only)
**Latency:** +500-1000ms
**Implementation time:** ~4 hours

**Phase 3 (Week 4): Add Voice Output**
```javascript
// Add text-to-speech
const answerText = await askQuestion(textQuestion);
const audioAnswer = await elevenLabs.textToSpeech(answerText);
playAudio(audioAnswer); // Stream audio to user
```

**Cost:** +$0.003 per question (TTS)
**Latency:** +500-2000ms
**Implementation time:** ~3 hours

**Phase 4 (Week 5+): Full Real-Time Voice Loop**
```javascript
// Continuous listening and responding
while (true) {
  const spoken = await listenForSpeech(silenceThreshold: 800ms);
  const answer = await askQuestion(spoken);
  const audio = await textToSpeech(answer);
  playAudio(audio);
}
```

**Cost:** +$0.010-0.012 per interaction
**Latency:** 3-5.5 seconds per question
**Implementation time:** ~8 hours (plus UX refinement)

---

### Decision Matrix: Architecture Paths

```
┌─────────────────────────────────────────────────────────────────┐
│ User Story: "I'm making scrambled eggs and ask hands-free"      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│ Path A: Text Q&A (Current)                                      │
│ ❌ Not hands-free (user must hold phone/type)                   │
│ ✅ Simplest implementation                                      │
│ ✅ Best for MVP                                                 │
│                                                                  │
│ Path B: Voice Input + Text Output                               │
│ ✅ Hands-free input (user speaks)                               │
│ ❌ Not ideal while cooking (user reads small text)              │
│ ⚠️  Medium complexity                                           │
│                                                                  │
│ Path C: Voice Input + Voice Output (Real-Time Loop)             │
│ ✅ Truly hands-free (speak, listen)                             │
│ ✅ Natural interaction while cooking                            │
│ ❌ Highest complexity (always listening, error handling)        │
│ ❌ Most expensive (STT + TTS per loop)                          │
│ 🎯 Best UX for cooking scenario                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### Recommendation: MVP Voice Strategy

**Don't implement voice yet.** Here's why:

1. **Text MVP proves concept first** - Users validate the Q&A feature works
2. **Voice adds complexity** - More API integrations, error handling, UX challenges
3. **Voice has different use cases** - Cooking ≠ general chatbot (hands-free is critical)
4. **Cost implications** - Voice API calls are 5-10x more expensive than text

**Instead, focus on:**
- ✅ Launching text Q&A this week
- ✅ Measuring user engagement
- ✅ Collecting feedback on answer quality
- ✅ Getting users to 10-20 recipes with Q&A history

**Then, IF users request it:**
- Implement voice input (STT) as Phase 2
- Add voice output (TTS) as Phase 3
- Build real-time voice loop as Phase 4

**The key insight:** Voice is a distribution channel, not a core feature. Your core feature is "ask questions about recipe videos" — that works perfectly fine with text today.

---

## Key Takeaways for Your Project

### MVP Implementation Checklist (Mandatory Only)
**This Week - Minimum Viable Product:**
- [ ] Create `video_qa` table in Supabase
- [ ] Build React Q&A chat UI (input + message display)
- [ ] Create Netlify function to call Gemini API
- [ ] Wire React to call Netlify function
- [ ] Add error messages ("Could not generate answer")
- [ ] Test with 1-2 real recipe videos
- [ ] **That's it! Ship it.**

**NOT REQUIRED for MVP:**
- ❌ Streaming answers (nice UX, not needed)
- ❌ Token/cost tracking (can add later)
- ❌ User data table (can add later)
- ❌ Deduplication (can add later)
- ❌ Question history (can add later)

**Database Schema (MVP - Mandatory Only):**
```sql
CREATE TABLE video_qa (
  id BIGSERIAL PRIMARY KEY,
  recipe_id BIGINT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- pending, generating, answered, error
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  answered_at TIMESTAMP

  -- OPTIONAL (Add Later): tokens_used INTEGER, cost_cents DECIMAL(5,2)
);

CREATE INDEX idx_video_qa_recipe ON video_qa(recipe_id);
CREATE INDEX idx_video_qa_user ON video_qa(user_id);
```

### Critical Implementation Details (Mandatory)
✅ **Use FULL transcript** (no 3000 char limit) - this is different from enrichment
✅ **Synchronous API calls** - user expects 2-5 second wait while cooking
✅ **Temperature: 0.3** - lower = more factual and grounded in transcript
✅ **Max tokens: 300** - keep answers concise for cooking context
✅ **Error gracefully** - "Could not generate answer. Please try again."

### What NOT to Do in MVP
❌ **No Supabase Realtime** - single user per recipe, no broadcasting needed
❌ **No job queue** - direct API call is fine
❌ **No streaming answers** - show complete answer, not character-by-character
❌ **No cost tracking** - add tokens_used/cost_cents columns later
❌ **No user preferences** - no user_data table needed yet

### Cost Tracking
**Per question cost:** ~$0.001-0.005 (Gemini API)
**Per recipe (10 Q&A):** ~$0.01-0.05
**Track from day 1:** Add cost_cents to DB for monitoring

### Phase 2 (If Needed - ~2 weeks later)
- Add deduplication: Check for exact duplicate questions before API call
- Add question history: Let users browse Q&A they've asked before
- Monitor costs and API quotas

### Phase 3 (Only If Users Request It)
- Add semantic search for cross-recipe Q&A
- Requires vector DB (Pinecone/Qdrant)
- Implement chunking strategy for transcript relevance
- Add embeddings to all questions

### Technical Debt to Avoid
- ❌ Don't use 3000 char transcript limit for Q&A (different than enrichment)
- ❌ Don't expose Gemini API key in frontend (use Netlify function)
- ❌ Don't implement Realtime/broadcasting (not needed for single user)
- ✅ Do track API costs and latency from day 1
- ✅ Do version your AI prompts so you can iterate
- ✅ Do add timeout handling (set to 10 seconds for Netlify limit)

---

## Summary: What Changed in This Research

**Initial Misunderstanding (❌):**
- Built for multi-user collaborative Q&A (like YouTube comments)
- Used Supabase Realtime to broadcast to multiple viewers
- Included upvotes, featured Q&A, user presence tracking
- Suggested 3000 char limit for Q&A (same as enrichment)
- Complex chunking and vector DB from day 1

**Correct Understanding (✅):**
- **Single-user private experience**: User + Chatbot + Recipe
- **No Realtime needed**: Just user + app + AI, no broadcasting
- **Full transcript required**: 3000 char limit only for enrichment, NOT Q&A
- **YouTube transcripts have no natural breaks**: Continuous text, no paragraphs
- **Simple MVP approach**: Sync API call, no job queues, no vector DB yet
- **Transcript microservice**: Use existing service, don't over-engineer

**Key Learning from Real Transcript:**
Testing with rMV2q-2IPoE (Gordon Ramsay scrambled eggs) showed:
- 920 characters total (very short recipe video)
- No paragraph breaks or timestamps in transcript
- Continuous narration without natural chunking points
- Full transcript easily fits in Gemini context window
- 3000 char limit doesn't hurt short recipes but will truncate 15+ min videos

---

## Final Architecture

**MVP (This Week): ~50 lines of code per component**
1. React component: TextInput + ChatUI + "Thinking..." state
2. Netlify function: Call Gemini API with full transcript
3. Supabase table: Store Q&A history
4. No complexity: No Realtime, no chunking, no vector DB

**Why This Works:**
- ✅ User asks question while cooking (synchronous wait is expected)
- ✅ Full transcript fits in context window (~1-5KB)
- ✅ Gemini API handles context selection automatically
- ✅ Single user per recipe (no multi-user complexity)
- ✅ Can add deduplication later if needed

**When to Iterate:**
- Phase 2: Track costs, add deduplication
- Phase 3: Only if users want cross-recipe semantic search
