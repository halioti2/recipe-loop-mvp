/**
 * Print real character counts for all recipe transcripts
 *
 * RUN:
 *   node --env-file=.env scripts/transcript-char-counts.js
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const { data, error } = await supabase
  .from('recipes')
  .select('title, transcript')
  .order('title')

if (error) { console.error('Supabase error:', error); process.exit(1) }

const rows = data.map(r => ({
  title: r.title,
  chars: r.transcript ? r.transcript.length : null,
})).sort((a, b) => (a.chars ?? -1) - (b.chars ?? -1))

const maxTitle = Math.max(...rows.map(r => r.title.length))

console.log('\nTranscript character counts (shortest → longest)\n')
console.log(`${'Title'.padEnd(maxTitle)}  Chars`)
console.log(`${'-'.repeat(maxTitle)}  -----`)
for (const r of rows) {
  const chars = r.chars === null ? '(no transcript)' : r.chars.toLocaleString()
  console.log(`${r.title.padEnd(maxTitle)}  ${chars}`)
}

const withTranscript = rows.filter(r => r.chars !== null)
console.log(`\nMin: ${Math.min(...withTranscript.map(r => r.chars)).toLocaleString()} chars`)
console.log(`Max: ${Math.max(...withTranscript.map(r => r.chars)).toLocaleString()} chars`)
