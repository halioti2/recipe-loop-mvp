// Enhanced OAuth Testing Console Commands
// Copy and paste these commands into the browser DevTools console to test various scenarios

console.log('🧪 Starting Enhanced OAuth Token Management Tests...\n');

// Test 1: Check Token Storage Configuration
console.log('=== Test 1: Token Storage Check ===');
const checkTokenStorage = () => {
  console.log('Checking localStorage for token data...');
  
  Object.keys(localStorage).forEach(key => {
    if (key.includes('provider_token') || key.includes('provider_refresh')) {
      console.log(`📦 ${key}:`, localStorage.getItem(key));
    }
  });
  
  if (!Object.keys(localStorage).some(key => key.includes('provider'))) {
    console.log('❌ No provider tokens found in storage');
  }
};
checkTokenStorage();

// Test 2: Check Google OAuth Configuration
console.log('\n=== Test 2: OAuth Configuration Check ===');
console.log('✅ Client ID configured:', !!import.meta.env.VITE_GOOGLE_CLIENT_ID);
console.log('✅ Client Secret configured:', !!import.meta.env.VITE_GOOGLE_CLIENT_SECRET);
console.log('📝 Client ID:', import.meta.env.VITE_GOOGLE_CLIENT_ID?.substring(0, 20) + '...');

// Test 3: Enhanced Error Simulation
console.log('\n=== Test 3: Error Simulation ===');
window.simulateExpiredToken = (userId) => {
  if (!userId) {
    console.log('❌ Please provide userId. Check localStorage for provider_token_[userId] keys');
    return;
  }
  
  const expiredToken = {
    token: 'fake-expired-token',
    expiresAt: Date.now() - 1000,
    userId
  };
  
  localStorage.setItem(`provider_token_${userId}`, JSON.stringify(expiredToken));
  console.log('🔄 Simulated expired token. Refresh page to test expiration handling.');
};

// Test 4: Token Validation
console.log('\n=== Test 4: Token Validation ===');
window.validateStoredTokens = () => {
  const now = Date.now();
  
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('provider_token_')) {
      try {
        const tokenData = JSON.parse(localStorage.getItem(key));
        const isValid = tokenData.expiresAt > now;
        const timeRemaining = Math.max(0, tokenData.expiresAt - now);
        const minutes = Math.floor(timeRemaining / 60000);
        
        console.log(`${isValid ? '✅' : '❌'} ${key}: ${isValid ? 'Valid' : 'Expired'} (${minutes}m remaining)`);
      } catch (e) {
        console.log(`❌ ${key}: Invalid format`);
      }
    }
  });
};
window.validateStoredTokens();

// Test 5: Clear All Tokens (for testing re-auth flow)
window.clearAllTokens = () => {
  console.log('🧹 Clearing all stored tokens...');
  
  Object.keys(localStorage).forEach(key => {
    if (key.includes('provider_token') || key.includes('provider_refresh')) {
      localStorage.removeItem(key);
      console.log(`🗑️ Removed ${key}`);
    }
  });
  
  console.log('✅ All tokens cleared. Refresh page to test re-authentication flow.');
};

// Test 6: Backend Endpoint Test
console.log('\n=== Test 6: Backend Endpoint Test ===');
window.testRefreshEndpoint = async (refreshToken) => {
  if (!refreshToken) {
    console.log('❌ Please provide a refresh token');
    return;
  }
  
  try {
    // This would need a valid Supabase session token
    console.log('🔍 Testing refresh endpoint...');
    
    const response = await fetch('/.netlify/functions/refresh-google-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // This will fail auth but test the endpoint
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    
    const result = await response.json();
    console.log('📡 Endpoint response:', result);
    
    if (response.status === 401) {
      console.log('✅ Endpoint is working (auth validation working)');
    } else if (response.ok) {
      console.log('✅ Token refresh successful!');
    } else {
      console.log('❌ Endpoint error:', result.error);
    }
    
  } catch (error) {
    console.log('❌ Network error testing endpoint:', error.message);
  }
};

// Test 7: Monitor Auth Events
console.log('\n=== Test 7: Auth Event Monitor ===');
if (window.supabase) {
  window.supabase.auth.onAuthStateChange((event, session) => {
    console.log(`🔄 Auth Event: ${event}`);
    if (session?.provider_token) {
      console.log('✅ Provider token available in session');
    }
    if (session?.provider_refresh_token) {
      console.log('✅ Provider refresh token available');
    }
  });
}

// Instructions
console.log('\n📋 Available Test Commands:');
console.log('• validateStoredTokens() - Check token expiration status');
console.log('• simulateExpiredToken(userId) - Create expired token for testing');
console.log('• clearAllTokens() - Clear all stored tokens');
console.log('• testRefreshEndpoint(refreshToken) - Test backend refresh');
console.log('• checkTokenStorage() - Re-check localStorage');

console.log('\n🎯 Testing Sequence:');
console.log('1. Sign in with Google and check token storage');
console.log('2. Refresh page and verify tokens persist');
console.log('3. Use simulateExpiredToken() to test expiration handling');
console.log('4. Use clearAllTokens() to test re-authentication flow');

console.log('\n🔧 Enhanced OAuth Testing Ready!');