import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { YouTubeService, YouTubeAPIError } from '../services/youtubeService';
import { supabase } from '../lib/supabaseClient';
import { useYouTubeAuth } from '../hooks/useYouTubeAuth';
import { YouTubeConnectionStatus } from '../components/YouTubeConnectionStatus';

export default function PlaylistDiscoveryPage() {
  const { user } = useAuth();
  const { connected, checkConnection, getAccessToken } = useYouTubeAuth();
  const [searchParams] = useSearchParams();
  const [playlists, setPlaylists] = useState([]);
  const [connectedPlaylists, setConnectedPlaylists] = useState(new Set());
  const [playlistMapping, setPlaylistMapping] = useState(new Map()); // YouTube ID -> Database UUID
  const [syncingPlaylists, setSyncingPlaylists] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(new Set());
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [channelInfo, setChannelInfo] = useState(null);

  // Handle OAuth callback: ?connected=true or ?error=<code>
  useEffect(() => {
    const oauthConnected = searchParams.get('connected');
    const oauthError = searchParams.get('error');

    if (oauthConnected === 'true') {
      setSuccessMessage('YouTube connected successfully! You can now sync playlists.');
      checkConnection();
      const timer = setTimeout(() => {
        window.history.replaceState({}, '', '/playlist-discovery');
        setSuccessMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }

    if (oauthError) {
      const messages = {
        access_denied: 'YouTube connection cancelled.',
        invalid_state: 'Connection failed: session expired. Please try again.',
        token_exchange_failed: 'Connection failed: could not retrieve YouTube token. Please try again.',
      };
      setError(messages[oauthError] || `Connection failed: ${oauthError}`);
      window.history.replaceState({}, '', '/playlist-discovery');
    }
  }, [searchParams, checkConnection]);

  // Fetch playlists whenever YouTube connection becomes available
  useEffect(() => {
    if (connected) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [connected]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAccessToken();
      if (!token) {
        setError('YouTube token unavailable. Please reconnect your YouTube account.');
        setLoading(false);
        return;
      }

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
      // Build mapping from YouTube playlist ID to database UUID
      const mapping = new Map();
      existingPlaylists.forEach(p => {
        mapping.set(p.youtube_playlist_id, p.id);
      });
      setPlaylistMapping(mapping);

    } catch (err) {
      console.error('Failed to fetch YouTube data:', err);
      setError(err.message || 'Failed to load your YouTube playlists');
    } finally {
      setLoading(false);
    }
  };

  const fetchConnectedPlaylists = async () => {
    const { data, error } = await supabase
      .from('user_playlists')
      .select('id, youtube_playlist_id')
      .eq('user_id', user.id)
      .eq('active', true); // Only get active playlists

    if (error) {
      console.error('Failed to fetch connected playlists:', error);
      return [];
    }

    return data || [];
  };

  const handleConnectPlaylist = async (playlist) => {
    const playlistId = playlist.id;
    
    if (connecting.has(playlistId)) return;
    
    setConnecting(prev => new Set([...prev, playlistId]));

    try {
      // First check if playlist already exists (might be inactive)
      const { data: existingPlaylist, error: checkError } = await supabase
        .from('user_playlists')
        .select('id, active')
        .eq('user_id', user.id)
        .eq('youtube_playlist_id', playlistId)
        .single();

      let userPlaylistId;
      
      if (existingPlaylist) {
        // Playlist exists, just reactivate it
        const { error: updateError } = await supabase
          .from('user_playlists')
          .update({ 
            active: true,
            sync_enabled: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingPlaylist.id);
          
        if (updateError) throw updateError;
        userPlaylistId = existingPlaylist.id;
        console.log(`✅ Reactivated playlist: ${playlist.snippet.title}`);
        
      } else {
        // New playlist, create it
        const { data, error } = await supabase
          .from('user_playlists')
          .insert({
            user_id: user.id,
            youtube_playlist_id: playlistId,
            title: playlist.snippet.title,
            description: playlist.snippet.description || '',
            thumbnail_url: playlist.snippet.thumbnails?.high?.url || playlist.snippet.thumbnails?.medium?.url,
            video_count: playlist.contentDetails?.itemCount || 0,
            sync_enabled: true,
            active: true
          })
          .select('id')
          .single();

        if (error) {
          if (error.code === '23505') { // Unique constraint violation
            throw new Error('This playlist is already connected');
          }
          throw error;
        }
        
        userPlaylistId = data.id;
        console.log(`✅ Connected new playlist: ${playlist.snippet.title}`);
      }

      setConnectedPlaylists(prev => new Set([...prev, playlistId]));
      setPlaylistMapping(prev => new Map(prev).set(playlistId, userPlaylistId));
      
    } catch (err) {
      console.error('Failed to connect playlist:', err);
      alert(`Failed to connect playlist: ${err.message}`);
    } finally {
      setConnecting(prev => {
        const newSet = new Set(prev);
        newSet.delete(playlistId);
        return newSet;
      });
    }
  };

  const handleSyncPlaylist = async (userPlaylistId) => {
    if (syncingPlaylists.has(userPlaylistId)) return;

    // Check connection before attempting sync
    await checkConnection();
    if (!connected) {
      setError('YouTube not connected. Please connect your YouTube account first.');
      return;
    }

    setSyncingPlaylists(prev => new Set([...prev, userPlaylistId]));
    setError(null);
    setSuccessMessage('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }

      const response = await fetch('/.netlify/functions/playlist-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_playlist_id: userPlaylistId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (errorData.error === 'youtube_not_connected') {
          await checkConnection();
        }
        throw new Error(errorData.error || 'Sync failed');
      }

      const result = await response.json();
      setSuccessMessage(
        `✅ Synced "${result.playlist_name}": ${result.global_recipes_created} new recipes created globally, ` +
        `${result.user_recipes_added} recipes added to your playlist, ` +
        `${result.already_in_playlist} already in playlist (${result.total_videos} total videos)`
      );

      await fetchData();

    } catch (err) {
      console.error('Sync failed:', err);
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncingPlaylists(prev => {
        const newSet = new Set(prev);
        newSet.delete(userPlaylistId);
        return newSet;
      });
    }
  };

  const handleDisconnectPlaylist = async (playlistId) => {
    if (connecting.has(playlistId)) return;
    
    setConnecting(prev => new Set([...prev, playlistId]));

    try {
      // Set playlist as inactive instead of deleting
      const { error } = await supabase
        .from('user_playlists')
        .update({ 
          active: false, 
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('youtube_playlist_id', playlistId);

      if (error) throw error;

      setConnectedPlaylists(prev => {
        const newSet = new Set(prev);
        newSet.delete(playlistId);
        return newSet;
      });
      
      setPlaylistMapping(prev => {
        const newMap = new Map(prev);
        newMap.delete(playlistId);
        return newMap;
      });

      console.log('✅ Deactivated playlist');
      
    } catch (err) {
      console.error('Failed to disconnect playlist:', err);
      alert(`Failed to disconnect playlist: ${err.message}`);
    } finally {
      setConnecting(prev => {
        const newSet = new Set(prev);
        newSet.delete(playlistId);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading your YouTube playlists...</span>
        </div>
      </div>
    );
  }

  if (!connected && !loading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">YouTube Playlists</h1>
          <YouTubeConnectionStatus />
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a2.64 2.64 0 0 0-2.653-2.334c-2.338-.146-11.845-.146-11.845-.146S.662 3.706.344 3.852A2.64 2.64 0 0 0 .344 8.52c0 2.339.312 4.677.312 4.677s.318 2.339 2.653 2.484c2.339.146 11.845.146 11.845.146s9.507 0 11.845-.146a2.64 2.64 0 0 0 2.653-2.484s.312-2.338.312-4.677-.312-4.677-.312-4.677z"/>
              <path d="M9.545 15.568V8.432l6.364 3.568z"/>
            </svg>
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">YouTube Playlists</h1>
            {channelInfo && (
              <p className="text-gray-600">
                Connected to: <span className="font-medium">{channelInfo.snippet.title}</span>
              </p>
            )}
            {/* YouTube Connection Status */}
            <div className="mt-3">
              <YouTubeConnectionStatus />
            </div>
          </div>
        </div>
        <p className="text-gray-600">
          Connect your YouTube playlists to sync recipe videos automatically. 
          Only connected playlists will be scanned for new recipes.
        </p>
      </div>

      {/* Success/Error Messages */}
      {(successMessage || error) && (
        <div className="mb-6">
          {successMessage && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-800">{successMessage}</p>
                </div>
                <div className="ml-auto pl-3">
                  <button onClick={() => setSuccessMessage('')} className="text-green-400 hover:text-green-600">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
                <div className="ml-auto pl-3">
                  <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {playlists.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{playlists.length}</div>
            <div className="text-sm text-gray-600">Total Playlists</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{connectedPlaylists.size}</div>
            <div className="text-sm text-gray-600">Connected</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {playlists.reduce((sum, p) => sum + (p.contentDetails?.itemCount || 0), 0)}
            </div>
            <div className="text-sm text-gray-600">Total Videos</div>
          </div>
        </div>
      )}

      {/* Playlists Grid */}
      {playlists.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No playlists found</h3>
          <p className="text-gray-600 mb-4">
            Create some playlists on YouTube first, then refresh this page.
          </p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Refresh Playlists
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => {
            const isConnected = connectedPlaylists.has(playlist.id);
            const isLoading = connecting.has(playlist.id);
            const isSyncing = syncingPlaylists.has(playlist.id);
            
            // Get user playlist ID for connected playlists  
            const userPlaylistId = playlistMapping.get(playlist.id);
            
            return (
              <div
                key={playlist.id}
                className={`border rounded-lg overflow-hidden bg-white hover:shadow-md transition-shadow ${
                  isConnected ? 'ring-2 ring-green-200 border-green-300' : ''
                }`}
              >
                {/* Thumbnail */}
                <div className="aspect-video overflow-hidden bg-gray-200">
                  {playlist.snippet.thumbnails?.medium?.url ? (
                    <img
                      src={playlist.snippet.thumbnails.medium.url}
                      alt={playlist.snippet.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                    {playlist.snippet.title}
                  </h3>
                  
                  {playlist.snippet.description && (
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                      {playlist.snippet.description}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500">
                      {playlist.contentDetails?.itemCount || 0} videos
                    </span>
                    {isConnected && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        Connected
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="space-y-2">
                    {/* Connect/Disconnect Button */}
                    <button
                      onClick={() => isConnected ? handleDisconnectPlaylist(playlist.id) : handleConnectPlaylist(playlist)}
                      disabled={isLoading}
                      className={`w-full py-2 px-4 rounded text-sm font-medium transition-colors ${
                        isConnected
                          ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isLoading ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                          {isConnected ? 'Disconnecting...' : 'Connecting...'}
                        </div>
                      ) : isConnected ? (
                        'Disconnect Playlist'
                      ) : (
                        'Connect Playlist'
                      )}
                    </button>

                    {/* Sync Button - Only show for connected playlists */}
                    {isConnected && (
                      <button
                        onClick={() => handleSyncPlaylist(userPlaylistId)}
                        disabled={isSyncing}
                        className={`w-full py-2 px-4 rounded text-sm font-medium transition-colors bg-green-600 text-white hover:bg-green-700 ${
                          isSyncing ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {isSyncing ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                            Syncing Recipes...
                          </div>
                        ) : (
                          '🔄 Sync Recipes'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      {playlists.length > 0 && (
        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2">What happens when you connect a playlist?</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Recipe videos from the playlist will be automatically synced</li>
            <li>• New videos added to the playlist will be detected in future syncs</li>
            <li>• You can view playlist-specific recipe collections</li>
            <li>• Sync can be paused/resumed per playlist</li>
          </ul>
        </div>
      )}
    </div>
  );
}