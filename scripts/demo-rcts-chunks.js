/**
 * Demo: simulate RecursiveCharacterTextSplitter on Honey Miso transcript
 * Shows first 4 chunks so you can see how sentence accumulation works.
 *
 * RUN:
 *   node --env-file=.env scripts/demo-rcts-chunks.js
 */

import { createClient } from '@supabase/supabase-js'

const CHUNK_SIZE    = 1500
const CHUNK_OVERLAP = 150
const SEPARATORS    = ['. ', '? ', '! ', ' ']
const SHOW_CHUNKS   = 99

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data, error } = await supabase
  .from('recipes')
  .select('title, transcript')
  .ilike('title', '%Honey Miso%')
  .single()

if (error) { console.error(error); process.exit(1) }

const transcript = data.transcript
console.log(`\nTitle:      ${data.title}`)
console.log(`Total chars: ${transcript.length.toLocaleString()}\n`)

// --- RCTS simulation ---
// Split on the first separator that produces pieces, then accumulate
// pieces into chunks of up to CHUNK_SIZE, carrying CHUNK_OVERLAP forward.

function splitOnSeparator(text, sep) {
  const parts = []
  let remaining = text
  while (remaining.length > 0) {
    const idx = remaining.indexOf(sep)
    if (idx === -1) { parts.push(remaining); break }
    parts.push(remaining.slice(0, idx + sep.length))
    remaining = remaining.slice(idx + sep.length)
  }
  return parts.filter(p => p.length > 0)
}

function rcts(text) {
  // Try each separator until we get meaningful splits
  let pieces = [text]
  for (const sep of SEPARATORS) {
    const split = text.split(sep).filter(p => p.trim().length > 0)
      .map((p, i, arr) => i < arr.length - 1 ? p + sep : p)
    if (split.length > 1) { pieces = split; break }
  }

  const chunks = []
  let current = ''

  for (const piece of pieces) {
    if ((current + piece).length <= CHUNK_SIZE) {
      current += piece
    } else {
      if (current.length > 0) chunks.push(current)
      // carry overlap from end of previous chunk
      const overlap = current.slice(-CHUNK_OVERLAP)
      current = overlap + piece
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

const chunks = rcts(transcript)

console.log(`Total chunks: ${chunks.length}`)
console.log(`─`.repeat(60))

chunks.slice(0, SHOW_CHUNKS).forEach((chunk, i) => {
  const overlapText = i > 0 ? chunk.slice(0, CHUNK_OVERLAP).trim() : null
  console.log(`\nCHUNK ${i + 1} — ${chunk.length} chars`)
  if (overlapText) console.log(`[↑ overlap from chunk ${i}: "${overlapText}"]\n`)
  console.log(chunk.trim())
  console.log(`\n${'─'.repeat(60)}`)
})

console.log(`\nShowing ${Math.min(SHOW_CHUNKS, chunks.length)} of ${chunks.length} total chunks`)
