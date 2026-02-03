import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

// Robust YouTube video ID extractor
function getYouTubeVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  
  const patterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
    /youtube\.com\/embed\/([^"&?\/\s]{11})/,
    /youtube\.com\/v\/([^"&?\/\s]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Temporary version for testing multi-user functionality
// Shows recipes that the user has added to their lists
export default function HomePageTest() {
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [userLists, setUserLists] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [resyncing, setResyncing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const { user, getYouTubeToken } = useAuth();

  // Development-only fallback user ID
  const getTestUserId = () => {
    if (process.env.NODE_ENV === 'development') {
      return process.env.REACT_APP_TEST_USER_ID || null;
    }
    return null;
  };
  
  const currentUserId = user?.id || getTestUserId();

  async function fetchUserRecipes() {
    setLoading(true);

    if (import.meta.env.DEV) {
      console.log('=== HOMEPAGE TEST DEBUG ===');
      console.log('Current user ID:', currentUserId);
      console.log('Actual user:', user?.email);
      
      // Debug supabase client state
      const session = await supabase.auth.getSession();
      console.log('Supabase session:', {
        hasSession: !!session.data.session,
        userId: session.data.session?.user?.id,
        isAuthenticated: !!session.data.session?.access_token
      });
    }

    // Phase 2.3: Query user_recipes table for user-specific recipe ownership
    const { data: userRecipesData, error: userRecipesError } = await supabase
      .from('user_recipes')
      .select(`
        id,
        added_at,
        is_favorite,
        personal_notes,
        playlist_id,
        position_in_playlist,
        recipes (
          id,
          title,
          video_url,
          channel,
          summary,
          ingredients,
          youtube_video_id,
          sync_status,
          created_at
        ),
        user_playlists!inner (
          id,
          title,
          youtube_playlist_id,
          active
        )
      `)
      .eq('user_id', currentUserId)
      .eq('user_playlists.active', true) // Only recipes from active playlists
      .order('added_at', { ascending: false });

    if (userRecipesError) {
      console.error('❌ Error fetching user recipes from user_recipes table:', userRecipesError);
      
      // Fallback to old lists-based approach for compatibility
      await fetchUserRecipesLegacy();
      return;
    }

    if (import.meta.env.DEV) {
      console.log('Raw query result:', {
        dataLength: userRecipesData?.length || 0,
        error: userRecipesError,
        sampleData: userRecipesData?.slice(0, 2)
      });
    }

    if (userRecipesData) {
      // Debug the raw data structure first
      if (import.meta.env.DEV) {
        console.log('Raw userRecipesData structure:');
        userRecipesData.slice(0, 3).forEach((item, idx) => {
          console.log(`Item ${idx}:`, {
            id: item.id,
            hasRecipes: !!item.recipes,
            recipesKeys: item.recipes ? Object.keys(item.recipes) : 'null/undefined',
            recipes: item.recipes
          });
        });
      }

      // Process user recipes with playlist context  
      const recipesWithContext = userRecipesData
        .filter(userRecipe => userRecipe.recipes) // Only include items with recipe data
        .map(userRecipe => ({
          ...userRecipe.recipes,
          // Add user-specific context
          user_recipe_id: userRecipe.id,
          added_at: userRecipe.added_at,
          is_favorite: userRecipe.is_favorite,
          personal_notes: userRecipe.personal_notes,
          playlist_context: userRecipe.user_playlists ? {
            playlist_id: userRecipe.playlist_id,
            playlist_title: userRecipe.user_playlists.title,
            position: userRecipe.position_in_playlist
          } : null
        }));

      setRecipes(recipesWithContext);
      
      if (import.meta.env.DEV) {
        console.log('Found user recipes (Phase 2.3):', userRecipesData.length);
        console.log('Recipes with playlist context:', recipesWithContext);
        
        // Debug ingredients availability
        const ingredientsStats = recipesWithContext.map(r => ({
          title: r.title,
          hasIngredients: Array.isArray(r.ingredients) && r.ingredients.length > 0,
          ingredientsLength: Array.isArray(r.ingredients) ? r.ingredients.length : 'not array',
          ingredientsType: typeof r.ingredients,
          ingredientsSample: Array.isArray(r.ingredients) ? r.ingredients.slice(0, 2) : r.ingredients
        }));
        console.log('Ingredients debug:', ingredientsStats);
      }
    }

    setLoading(false);
  }

  // Legacy fallback function for compatibility with old data structure
  async function fetchUserRecipesLegacy() {
    // Get recipes through the user's lists (legacy approach)
    const { data: listsData, error: listsError } = await supabase
      .from('lists')
      .select(`
        id,
        recipe_id,
        ingredients,
        recipes (
          id,
          title,
          video_url,
          channel,
          summary,
          ingredients,
          created_at
        )
      `)
      .eq('user_id', currentUserId)
      .order('created_at', { ascending: false });

    if (listsError) {
      console.error('❌ Error fetching user lists:', listsError);
      setLoading(false);
      return;
    }

    if (listsData) {
      setUserLists(listsData);
      // Extract unique recipes from the user's lists
      const uniqueRecipes = [];
      const seenRecipeIds = new Set();
      
      listsData.forEach(list => {
        if (list.recipes && !seenRecipeIds.has(list.recipes.id)) {
          uniqueRecipes.push({
            ...list.recipes,
            // Add context to distinguish from Phase 2.3 recipes
            legacy_source: 'lists'
          });
          seenRecipeIds.add(list.recipes.id);
        }
      });
      
      setRecipes(uniqueRecipes);
      
      if (import.meta.env.DEV) {
        console.log('Found lists (legacy):', listsData.length);
        console.log('Unique recipes (legacy):', uniqueRecipes.length);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchUserRecipes();
  }, [currentUserId]);

  async function handlePlaylistSync() {
    setResyncing(true);
    try {
      // Get user's YouTube token for API calls
      const youtubeToken = await getYouTubeToken();
      if (!youtubeToken) {
        throw new Error('YouTube authentication required. Please sign in again.');
      }

      // Get all active playlists for this user
      const { data: activePlaylists, error: playlistError } = await supabase
        .from('user_playlists')
        .select('id, title')
        .eq('user_id', currentUserId)
        .eq('active', true);

      if (playlistError) {
        throw new Error(`Failed to get playlists: ${playlistError.message}`);
      }

      if (!activePlaylists || activePlaylists.length === 0) {
        alert('📋 No active playlists found. Please connect some playlists first.');
        return;
      }

      console.log(`🔄 Syncing ${activePlaylists.length} active playlists...`);
      
      let totalVideos = 0;
      let totalNewRecipes = 0;
      let totalUserRecipes = 0;
      let errors = [];

      // Sync each active playlist
      for (const playlist of activePlaylists) {
        try {
          console.log(`🎵 Syncing playlist: ${playlist.title}`);
          
          const syncResponse = await fetch('/.netlify/functions/playlist-sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              user_playlist_id: playlist.id,
              youtube_token: youtubeToken
            })
          });

          if (!syncResponse.ok) {
            throw new Error(`Sync failed for ${playlist.title}: ${syncResponse.status}`);
          }

          const result = await syncResponse.json();
          totalVideos += result.total_videos || 0;
          totalNewRecipes += result.global_recipes_created || 0;
          totalUserRecipes += result.user_recipes_added || 0;

          console.log(`✅ ${playlist.title}: ${result.user_recipes_added || 0} recipes added`);
          
        } catch (playlistError) {
          console.error(`❌ Error syncing ${playlist.title}:`, playlistError);
          errors.push(`${playlist.title}: ${playlistError.message}`);
        }
      }

      // Show results
      let message = `✅ Playlist sync complete!\n\n` +
        `📊 Results:\n` +
        `• Playlists synced: ${activePlaylists.length}\n` +
        `• Total videos processed: ${totalVideos}\n` +
        `• New recipes created: ${totalNewRecipes}\n` +
        `• Your recipes added: ${totalUserRecipes}\n\n`;

      if (errors.length > 0) {
        message += `⚠️ Errors:\n${errors.join('\n')}\n\n`;
      }

      message += `🔄 Refreshing your recipe collection...`;
      
      alert(message);
      
      // Refresh the recipes list
      await fetchUserRecipes();

    } catch (err) {
      console.error('❌ Playlist sync error:', err);
      alert(`Something went wrong during playlist sync: ${err.message}`);
    } finally {
      setResyncing(false);
    }
  }

  async function handleEnrichRecipes() {
    setEnriching(true);
    try {
      console.log('🔄 Starting recipe enrichment process...');
      
      const enrichResponse = await fetch('/.netlify/functions/playlist-enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: currentUserId,
          batch_size: 3,  // Process 3 recipes at a time
          max_recipes: 15  // Limit to 15 recipes per run
        })
      });

      if (!enrichResponse.ok) {
        throw new Error(`Enrichment failed: ${enrichResponse.status}`);
      }

      const result = await enrichResponse.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Enrichment process failed');
      }

      // Show results
      const stats = result.stats;
      let message = `✅ Recipe enrichment complete!\n\n` +
        `📊 Results:\n` +
        `• Recipes found needing enrichment: ${stats.recipes_found}\n` +
        `• Recipes processed: ${stats.recipes_processed}\n` +
        `• Transcripts added: ${stats.transcripts_added}\n` +
        `• Ingredients added: ${stats.ingredients_added}\n` +
        `• Success rate: ${stats.success_rate}\n` +
        `• Playlists affected: ${stats.playlists_affected}\n\n`;

      if (result.errors && result.errors.length > 0) {
        message += `⚠️ Some recipes had issues:\n${result.errors.slice(0, 3).map(e => `• ${e.title}: ${e.error}`).join('\n')}\n\n`;
      }

      message += `🔄 Refreshing your recipe collection...`;
      
      alert(message);
      
      // Refresh the recipes list to show updated data
      await fetchUserRecipes();

    } catch (err) {
      console.error('❌ Recipe enrichment error:', err);
      alert(`Something went wrong during recipe enrichment: ${err.message}`);
    } finally {
      setEnriching(false);
    }
  }

  async function handleAddToGroceryList(e, recipe) {
    e.stopPropagation();
    
    // Check if already in lists
    const existingList = userLists.find(list => list.recipe_id === recipe.id);
    if (existingList) {
      alert('Already in your grocery lists!');
      return;
    }

    try {
      const { error } = await supabase
        .from('lists')
        .insert([{ 
          recipe_id: recipe.id, 
          ingredients: recipe.ingredients || [],
          user_id: currentUserId
        }]);

      if (error) {
        console.error('❌ Error adding to list:', error);
        alert('Something went wrong. Try again.');
        return;
      }

      await supabase.from('events').insert([
        { 
          action: 'add_to_grocery_list', 
          recipe_id: recipe.id,
          user_id: currentUserId
        }
      ]);

      alert('Added to grocery list!');
      fetchUserRecipes(); // Refresh to show updated state
    } catch (err) {
      console.error('❌ Unexpected error:', err);
      alert('Something went wrong.');
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Welcome section */}
      <div className="mb-8">
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>🧪 Testing Multi-User Mode</strong><br/>
                This page shows recipes from your grocery lists (user-specific data).
                {user ? ` Logged in as: ${user.email}` : ' Using test user ID for demo.'}
                <br/>
                <strong>Current User ID:</strong> <code className="text-xs">{currentUserId}</code>
              </p>
            </div>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Your Recipe Collection
        </h1>
        <p className="text-gray-600">
          Recipes you've added to your grocery lists
        </p>
      </div>

      {/* Action buttons */}
      <div className="mb-6 flex gap-4">
        {/* Playlist Sync button */}
        <button
          onClick={handlePlaylistSync}
          disabled={resyncing || enriching}
          className={`px-6 py-3 rounded-lg font-medium text-white ${
            resyncing ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {resyncing ? 'Syncing Playlists…' : 'Sync Active Playlists'}
        </button>

        {/* Recipe Enrichment button */}
        <button
          onClick={handleEnrichRecipes}
          disabled={enriching || resyncing}
          className={`px-6 py-3 rounded-lg font-medium text-white ${
            enriching ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {enriching ? 'Enriching Recipes…' : 'Enrich Recipes'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading your recipes…</p>
        </div>
      ) : recipes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <div className="text-gray-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No recipes in your collection yet</h3>
          <p className="text-gray-600 mb-4">Add some recipes to your grocery lists to see them here!</p>
          <p className="text-sm text-gray-500">Note: This test version only shows recipes you've added to lists.</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe, index) => {
            const videoId = getYouTubeVideoId(recipe.video_url);
            const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
            const isExpanded = expandedId === recipe.id;
            const inList = userLists.find(list => list.recipe_id === recipe.id);

            return (
              <div
                key={recipe.id || `recipe-${index}`}
                className="bg-white border rounded-lg shadow hover:shadow-lg transition cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
              >
                <div className="aspect-w-16 aspect-h-9 overflow-hidden rounded-t-lg">
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt={recipe.title}
                      className="object-cover w-full h-48"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-48 bg-gray-200">
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h3a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1h3zM4 8h16l-1 12H5L4 8z" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{recipe.title}</h3>
                    <div className="flex items-center space-x-1">
                      {recipe.playlist_context && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          📺 {recipe.playlist_context.playlist_title}
                        </span>
                      )}
                      {recipe.legacy_source && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                          Legacy
                        </span>
                      )}
                      {inList && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          In List
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-600">Channel: {recipe.channel}</p>
                    {recipe.is_favorite && (
                      <span className="text-yellow-500">⭐</span>
                    )}
                  </div>

                  {recipe.personal_notes && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 italic">Note: {recipe.personal_notes}</p>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="mt-4 space-y-4">
                      {Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 ? (
                        <div>
                          <h4 className="font-medium text-gray-700 mb-2">Ingredients:</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-800 max-h-32 overflow-y-auto">
                            {recipe.ingredients.map((ingredient, idx) => (
                              <li key={`${recipe.id}-ingredient-${idx}`}>{ingredient}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-gray-400 italic">Ingredients not available.</p>
                          {import.meta.env.DEV && (
                            <p className="text-xs text-red-500 mt-1">
                              Debug: ingredients = {JSON.stringify(recipe.ingredients)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={(e) => handleAddToGroceryList(e, recipe)}
                    disabled={!!inList}
                    className={`mt-4 w-full px-4 py-2 rounded-lg text-sm font-medium ${
                      inList 
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {inList ? 'Already in List' : 'Add to Grocery List'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Debug info */}
      {import.meta.env.DEV && (
        <div className="mt-8 p-4 bg-gray-100 rounded-lg text-xs">
          <h4 className="font-medium mb-2">Debug Info:</h4>
          <p>User Lists: {userLists.length}</p>
          <p>Unique Recipes: {recipes.length}</p>
          <p>Current User ID: {currentUserId}</p>
        </div>
      )}
    </div>
  );
}