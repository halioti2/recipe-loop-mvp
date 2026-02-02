// Check what user_playlists exist for testing
console.log('🔍 Checking existing user_playlists for testing...')

// Use fetch instead of direct Supabase to avoid import issues
fetch('http://localhost:8888/.netlify/functions/debug-env')
  .then(res => res.json())
  .then(data => {
    console.log('Environment check:', data)
    
    // Now test a simple database query via a test endpoint
    return fetch('http://localhost:8888/.netlify/functions/connectivityTest')
  })
  .then(res => res.json())  
  .then(data => {
    console.log('Database connectivity:', data)
  })
  .catch(err => {
    console.error('Test failed:', err)
  })