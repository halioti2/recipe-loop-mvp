// src/lib/fetchTranscript.js
import { YoutubeTranscript } from 'youtube-transcript';

export async function fetchTranscript(videoId) {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    let transcript = segments.map(seg => seg.text).join(' ');
    if (transcript.length <= 1000) return transcript;

    // Split into sentences (preserves punctuation)
    const sentenceEnd = /([.?!])\s+/g;
    let sentences = transcript.split(sentenceEnd).reduce((acc, curr, idx, arr) => {
      if (idx % 2 === 0 && arr[idx + 1]) acc.push(curr + arr[idx + 1]);
      return acc;
    }, []);
    if (sentences.length > 2) transcript = sentences.slice(2).join(' ');
    return transcript.slice(0, 1000).trim();
  } catch (err) {
    console.error('Failed to fetch transcript:', err);
    return '';
  }
}