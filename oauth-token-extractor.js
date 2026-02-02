/**
 * Enhanced OAuth Token Extraction for Testing
 * 
 * Copy and paste this into your browser console while on the application
 * to extract your current valid OAuth token for testing
 */

console.log('🔍 Extracting OAuth tokens for testing...\n');

// Function to get current user ID and tokens
const getCurrentTokens = () => {
  const results = {
    userId: null,
    accessToken: null,
    refreshToken: null,
    tokenValid: false,
    expiresIn: null
  };

  // Find user ID from localStorage keys
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('provider_token_')) {
      results.userId = key.replace('provider_token_', '');
    }
  });

  if (results.userId) {
    try {
      // Get access token
      const tokenData = localStorage.getItem(`provider_token_${results.userId}`);
      if (tokenData) {
        const parsed = JSON.parse(tokenData);
        results.accessToken = parsed.token;
        results.tokenValid = parsed.expiresAt > Date.now();
        results.expiresIn = Math.max(0, parsed.expiresAt - Date.now());
      }

      // Get refresh token
      const refreshTokenData = localStorage.getItem(`provider_refresh_token_${results.userId}`);
      if (refreshTokenData) {
        results.refreshToken = refreshTokenData;
      }
    } catch (error) {
      console.error('Error parsing token data:', error);
    }
  }

  return results;
};

// Extract current tokens
const tokens = getCurrentTokens();

console.log('📊 Current Token Status:');
console.log('🆔 User ID:', tokens.userId);
console.log('🔑 Has Access Token:', !!tokens.accessToken);
console.log('⏰ Token Valid:', tokens.tokenValid);
if (tokens.expiresIn) {
  const minutes = Math.floor(tokens.expiresIn / 60000);
  console.log('⏱️ Expires in:', minutes, 'minutes');
}
console.log('🔄 Has Refresh Token:', !!tokens.refreshToken);

if (tokens.accessToken && tokens.tokenValid) {
  console.log('\n✅ Valid token found!');
  console.log('📝 Access Token (first 20 chars):', tokens.accessToken.substring(0, 20) + '...');
  
  console.log('\n🧪 Test Command:');
  console.log('Copy this curl command to test playlist sync:');
  console.log('');
  console.log(`curl -X POST http://localhost:8888/.netlify/functions/playlist-sync \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"user_playlist_id": "cf0cea86-7d58-423d-aafa-28e50f273c1c", "youtube_token": "${tokens.accessToken}"}'`);
  console.log('');
  
  // Also provide a JavaScript test
  console.log('\n🌐 Or test directly in browser:');
  console.log('');
  window.testPlaylistSync = async () => {
    try {
      console.log('🚀 Testing playlist sync with current token...');
      
      const response = await fetch('/.netlify/functions/playlist-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_playlist_id: 'cf0cea86-7d58-423d-aafa-28e50f273c1c',
          youtube_token: tokens.accessToken
        })
      });

      const result = await response.json();
      
      if (response.ok) {
        console.log('✅ Playlist sync successful!');
        console.log('📊 Results:', result);
        console.log(`📹 Total videos: ${result.total_videos}`);
        console.log(`🆕 New recipes created: ${result.global_recipes_created}`);
        console.log(`➕ User recipes added: ${result.user_recipes_added}`);
        console.log(`⏭️ Already in playlist: ${result.already_in_playlist}`);
      } else {
        console.log('❌ Playlist sync failed:');
        console.log('📋 Error:', result.error);
        if (result.details) {
          console.log('📋 Details:', result.details);
        }
      }
      
    } catch (error) {
      console.log('❌ Network error:', error.message);
    }
  };
  
  console.log('Run testPlaylistSync() to test the sync with your current token');
  
} else if (tokens.accessToken && !tokens.tokenValid) {
  console.log('\n⚠️ Token expired!');
  
  if (tokens.refreshToken) {
    console.log('🔄 Refresh token available - attempting refresh...');
    
    // Try to use the enhanced token refresh from AuthContext
    window.refreshAndTest = async () => {
      try {
        // This would need access to the AuthContext methods
        console.log('This would trigger the enhanced refresh logic in your AuthContext');
        console.log('Navigate to the Playlist Discovery page to trigger automatic refresh');
      } catch (error) {
        console.log('❌ Refresh failed:', error.message);
      }
    };
    
    console.log('Run refreshAndTest() or visit the Playlist Discovery page to auto-refresh');
  } else {
    console.log('❌ No refresh token available - re-authentication required');
  }
  
} else {
  console.log('\n❌ No valid tokens found');
  console.log('💡 Please sign in with Google to get OAuth tokens');
}

console.log('\n🔧 Available Commands:');
if (tokens.accessToken && tokens.tokenValid) {
  console.log('• testPlaylistSync() - Test playlist sync with current token');
}
console.log('• getCurrentTokens() - Re-check token status');
console.log('• clearAllTokens() - Clear all stored tokens (from previous script)');

console.log('\n🎯 Next Steps:');
console.log('1. If you have a valid token, run testPlaylistSync()');
console.log('2. If token is expired, visit Playlist Discovery page for auto-refresh');
console.log('3. If no token, sign out and sign back in with Google');

console.log('\n✨ Enhanced OAuth Token Testing Ready!');