import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { YouTubeService, YouTubeAPIError } from '../services/youtubeService';
import { supabase } from '../lib/supabaseClient';

export default function PlaylistDiscoveryPage() {
  const { getYouTubeToken, user, hasYouTubeAccess, signOut, signInWithGoogle } = useAuth();
  const [playlists, setPlaylists] = useState([]);
  const [connectedPlaylists, setConnectedPlaylists] = useState(new Set());
  const [syncingPlaylists, setSyncingPlaylists] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(new Set());
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [channelInfo, setChannelInfo] = useState(null);
  const [tokenStatus, setTokenStatus] = useState('checking'); // 'checking', 'available', 'unavailable'

  useEffect(() => {
    if (hasYouTubeAccess()) {
      checkTokenAndFetchData();
    } else {
      setError('YouTube access not available. Please sign in with Google.');
      setLoading(false);
    }
  }, [user]);

  const checkTokenAndFetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      setTokenStatus('checking');

      const token = await getYouTubeToken();
      if (!token) {
        setTokenStatus('unavailable');
        setError(
          'YouTube access token unavailable. This happens after page refresh due to Supabase OAuth limitations.'
        );
        setLoading(false);
        return;
      }

      setTokenStatus('available');
      await fetchData(token);
      
    } catch (err) {
      console.error('Token check failed:', err);
      setTokenStatus('unavailable');
      setError(err.message || 'Failed to access YouTube API');
      setLoading(false);
    }
  };

  const fetchData = async (token) => {
    try {
      const youtubeService = new YouTubeService(token);
      
      // Fetch user's playlists and channel info in parallel
      const [userPlaylists, channel, existingPlaylists] = await Promise.all([
        youtubeService.getUserPlaylists(50),
        youtubeService.getUserChannel(),
        fetchConnectedPlaylists()
      ]);

      setPlaylists(userPlaylists);
      setChannelInfo(channel);
      setConnectedPlaylists(new Set(existingPlaylists.map(p => p.youtube_playlist_id)));
      setTokenStatus('available');
      
    } catch (err) {
      console.error('Failed to fetch YouTube data:', err);
      
      // Check if it's a token issue
      if (err.message.includes('403') || err.message.includes('401')) {
        setTokenStatus('unavailable');
        setError('YouTube API access denied. Please re-authenticate with Google.');
      } else {
        setError(err.message || 'Failed to load your YouTube playlists');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReAuthenticate = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Sign out and redirect to re-auth
      await signOut();
      
      // Redirect to login or trigger Google sign-in
      // You might want to redirect to a login page instead
      const { error } = await signInWithGoogle();
      if (error) {
        throw error;
      }
      
    } catch (err) {
      console.error('Re-authentication failed:', err);
      setError(`Re-authentication failed: ${err.message}`);
      setLoading(false);
    }
  };

  const handleRetryToken = async () => {
    await checkTokenAndFetchData();
  };

  // Rest of your existing methods (fetchConnectedPlaylists, handleConnectPlaylist, etc.)
  const fetchConnectedPlaylists = async () => {
    const { data, error } = await supabase
      .from('user_playlists')
      .select('youtube_playlist_id')
      .eq('user_id', user.id);

    if (error) {
      console.error('Failed to fetch connected playlists:', error);
      return [];
    }

    return data || [];
  };

  const handleSyncPlaylist = async (userPlaylistId) => {
    setSyncingPlaylists(prev => new Set([...prev, userPlaylistId]));
    setError(null);
    setSuccessMessage('');

    try {
      const token = await getYouTubeToken();
      if (!token) {
        setTokenStatus('unavailable');
        throw new Error('YouTube access token unavailable for sync.');
      }

      // Call the Phase 2.3 smart playlist sync function
      const response = await fetch('/.netlify/functions/playlist-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_playlist_id: userPlaylistId,
          youtube_token: token
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Sync failed');
      }

      const result = await response.json();
      setSuccessMessage(
        `✅ Synced "${result.playlist_name}": ${result.global_recipes_created} new recipes created globally, ` +
        `${result.user_recipes_added} recipes added to your playlist, ` +
        `${result.already_in_playlist} already in playlist (${result.total_videos} total videos)`
      );
      
      // Refresh the data to show updated sync status
      await checkTokenAndFetchData();
      
    } catch (err) {
      console.error('Sync failed:', err);
      
      // Check if it's a token issue
      if (err.message.includes('token')) {
        setTokenStatus('unavailable');
      }
      
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncingPlaylists(prev => {
        const newSet = new Set(prev);
        newSet.delete(userPlaylistId);
        return newSet;
      });
    }
  };

  // Enhanced error display with re-authentication option
  const renderTokenError = () => (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
      <h3 className="text-lg font-semibold text-red-800 mb-2">
        YouTube Access Token Issue
      </h3>
      <p className="text-red-700 mb-4">
        {error}
      </p>
      
      <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
        <h4 className="font-semibold text-yellow-800">Why this happens:</h4>
        <ul className="text-yellow-700 text-sm mt-1">
          <li>• OAuth tokens are only available immediately after Google sign-in</li>
          <li>• Page refresh causes token loss (Supabase limitation)</li>
          <li>• YouTube API requires fresh tokens for playlist access</li>
        </ul>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleReAuthenticate}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          🔄 Sign Out & Re-authenticate with Google
        </button>
        
        <button
          onClick={handleRetryToken}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
        >
          🔄 Retry Token Access
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">
            {tokenStatus === 'checking' ? 'Checking YouTube access...' : 'Loading playlists...'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Your YouTube Playlists</h1>
        {channelInfo && (
          <p className="text-gray-600">
            Connected as: <span className="font-semibold">{channelInfo.title}</span>
          </p>
        )}
        
        {/* Token Status Indicator */}
        <div className="mt-2 flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            tokenStatus === 'available' ? 'bg-green-500' : 
            tokenStatus === 'checking' ? 'bg-yellow-500' : 'bg-red-500'
          }`}></div>
          <span className="text-sm text-gray-600">
            YouTube API: {
              tokenStatus === 'available' ? 'Connected' : 
              tokenStatus === 'checking' ? 'Checking...' : 'Disconnected'
            }
          </span>
        </div>
      </header>

      {tokenStatus === 'unavailable' && renderTokenError()}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {error && tokenStatus !== 'unavailable' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Rest of your playlist rendering logic */}
      {tokenStatus === 'available' && playlists.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-600">No playlists found in your YouTube account.</p>
        </div>
      )}

      {/* Your existing playlist grid/list rendering */}
    </div>
  );
}