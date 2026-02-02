import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

// Temporary version for testing multi-user functionality
// Shows recipes that the user has added to their lists
export default function HomePageTest() {
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [userLists, setUserLists] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [resyncing, setResyncing] = useState(false);
  const { user } = useAuth();

  // For testing - using your actual user ID from the database
  const testUserId = '88274763-038b-419a-81f9-da2db472cf31'; // ethan.davey@pursuit.org
  const currentUserId = user?.id || testUserId; // Use test ID if no user logged in

  async function fetchUserRecipes() {
    setLoading(true);

    if (import.meta.env.DEV) {
      console.log('=== HOMEPAGE TEST DEBUG ===');
      console.log('Current user ID:', currentUserId);
      console.log('Actual user:', user?.email);
    }

    // Get recipes through the user's lists (since recipes table doesn't have user_id yet)
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
          uniqueRecipes.push(list.recipes);
          seenRecipeIds.add(list.recipes.id);
        }
      });
      
      setRecipes(uniqueRecipes);
      
      if (import.meta.env.DEV) {
        console.log('Found lists:', listsData.length);
        console.log('Unique recipes:', uniqueRecipes.length);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchUserRecipes();
  }, [currentUserId]);

  async function handleResync() {
    setResyncing(true);
    try {
      const syncResponse = await fetch('/.netlify/functions/sync');
      const syncResult = await syncResponse.json();

      const enrichResponse = await fetch('/.netlify/functions/enrich');
      const enrichResult = await enrichResponse.json();

      alert(
        `✅ Resync complete.\n\n` +
        `Synced: ${syncResult.added || 0} new recipes.\n` +
        `Enriched: ${enrichResult.updated || 0} recipes.\n\n` +
        `🔄 Please refresh the page to see the latest updates.`
      );
    } catch (err) {
      console.error('❌ Resync error:', err);
      alert('Something went wrong during resync.');
    }
    setResyncing(false);
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

      {/* Sync button */}
      <button
        onClick={handleResync}
        disabled={resyncing}
        className={`mb-6 px-6 py-3 rounded-lg font-medium text-white ${
          resyncing ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
        }`}
      >
        {resyncing ? 'Resyncing…' : 'Resync & Enrich'}
      </button>

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
          {recipes.map((recipe) => {
            const videoId = recipe.video_url?.split('v=')[1];
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            const isExpanded = expandedId === recipe.id;
            const inList = userLists.find(list => list.recipe_id === recipe.id);

            return (
              <div
                key={recipe.id}
                className="bg-white border rounded-lg shadow hover:shadow-lg transition cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
              >
                <div className="aspect-w-16 aspect-h-9 overflow-hidden rounded-t-lg">
                  <img
                    src={thumbnailUrl}
                    alt={recipe.title}
                    className="object-cover w-full h-48"
                  />
                </div>

                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{recipe.title}</h3>
                    {inList && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                        In List
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">Channel: {recipe.channel}</p>

                  {isExpanded && (
                    <div className="mt-4 space-y-4">
                      {Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 ? (
                        <div>
                          <h4 className="font-medium text-gray-700 mb-2">Ingredients:</h4>
                          <ul className="list-disc list-inside space-y-1 text-sm text-gray-800 max-h-32 overflow-y-auto">
                            {recipe.ingredients.map((ingredient, idx) => (
                              <li key={idx}>{ingredient}</li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 italic">Ingredients not available.</p>
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