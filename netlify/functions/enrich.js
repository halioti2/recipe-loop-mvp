import { supabase } from '../../src/lib/supabaseClient.js';
import fetch from 'node-fetch';

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ status: 'enrich endpoint active' })
  };
  // we’ll fill in logic here next…
}
