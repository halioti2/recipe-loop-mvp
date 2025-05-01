// scripts/testTranscript.js
import fetchTranscript from '../src/lib/fetchTranscript.js';

const test = async () => {
  const videoId = '-ULzoYVOgKI'; // Replace with a known video ID
  const transcript = await fetchTranscript(videoId);

  console.log('\n✅ TRANSCRIPT RESULT');
  console.log('Length:', transcript.length);
  console.log('Preview:', transcript.slice(0, 1000));
};

test();
