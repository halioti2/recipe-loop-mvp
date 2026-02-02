# Enhanced YouTube OAuth Token Management Setup

## Add these to your .env file:

# Google OAuth credentials for direct token refresh
# Get these from Google Cloud Console > Credentials
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_SECRET=your-google-client-secret

# Note: These are the same credentials you use in Supabase Auth settings
# You need both for direct Google API token refresh

## Alternative: Backend-only Refresh (More Secure)

If you don't want client secrets in the frontend, create a backend endpoint:

```javascript
// netlify/functions/refresh-google-token.js
export async function handler(event, context) {
  const { refreshToken, userId } = JSON.parse(event.body)
  
  // Verify user is authenticated with Supabase
  const authHeader = event.headers.authorization
  // ... verify JWT token
  
  // Refresh Google token server-side
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  
  const data = await response.json()
  return {
    statusCode: 200,
    body: JSON.stringify({ access_token: data.access_token })
  }
}
```