import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [expandedId, setExpandedId] = useState(null); // 🔥 New: Track which recipe is expanded
  const [resyncing, setResyncing] = useState(false); // 🔥 New: Resync loading state

  useEffect(() => {
    async function fetchRecipes() {
      setLoading(true);

      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        setRecipes(data);
      }

      if (error) {
        console.error('❌ Fetch error:', error);
      }

      setLoading(false);
    }

    fetchRecipes();
  }, []);

  if (loading) {
    return <p className="p-4 text-center">Loading…</p>;
  }

  if (recipes.length === 0) {
    return <p className="p-4 text-center">No recipes yet.</p>;
  }

  async function handleAddToGroceryList(e, recipe) {
    e.stopPropagation(); // 🔥 Prevent the card from toggling expanded/collapsed
  
    try {
      // Step 1: Check if recipe is already in lists
      const { data: existing, error: checkError } = await supabase
        .from('lists')
        .select('id')
        .eq('recipe_id', recipe.id)
        .maybeSingle();
  
      if (checkError) {
        console.error('❌ Error checking lists:', checkError);
        alert('Something went wrong. Try again.');
        return;
      }
  
      if (existing) {
        alert('Already added.');
        return;
      }
  
      // Step 2: Insert into lists, now copying ingredients
      const { error: insertError } = await supabase
        .from('lists')
        .insert([
          {
            recipe_id: recipe.id,
            ingredients: recipe.ingredients || [], // 🟣 copy ingredients from recipe
          },
        ]);
  
      if (insertError) {
        console.error('❌ Error inserting into lists:', insertError);
        alert('Something went wrong. Try again.');
        return;
      }
  
      // Step 3: Log event into events table
      const { error: eventError } = await supabase
        .from('events')
        .insert([
          {
            action: 'add_to_grocery_list',
            recipe_id: recipe.id,
          },
        ]);
  
      if (eventError) {
        console.error('❌ Error logging event:', eventError);
        // (not critical — can skip showing user this)
      }
  
      // Step 4: Show success alert
      alert('Groceries added.');
    } catch (err) {
      console.error('❌ Unexpected error:', err);
      alert('Something went wrong.');
    }
  }  

  async function handleResync() {
    setResyncing(true); // Start loading
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
      
      // Optional: refresh recipes if fetchRecipes exists
      if (typeof fetchRecipes === 'function') {
        await fetchRecipes();
      }
    } catch (err) {
      console.error('❌ Resync error:', err);
      alert('Something went wrong during resync.');
    }
    setResyncing(false); // Done loading
  }

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={handleResync}
        disabled={resyncing}
        className={`mb-4 bg-purple-600 text-white px-4 py-2 rounded ${
          resyncing ? 'bg-purple-400 cursor-not-allowed' : 'hover:bg-purple-700'
        }`}
      >
        {resyncing ? 'Resyncing…' : 'Resync & Enrich'}
      </button>
      <h1 className="text-2xl font-bold mb-4">Saved Recipes</h1>

      {recipes.map((recipe) => {
        const videoId = recipe.video_url.split('v=')[1];
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const isExpanded = expandedId === recipe.id;

        return (
          <div
            key={recipe.id}
            className="border p-4 rounded shadow hover:shadow-md transition max-w-sm mx-auto cursor-pointer"
            onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
          >
            {/* Thumbnail */}
            <div className="aspect-w-16 aspect-h-9 mb-2 overflow-hidden rounded">
              <img
                src={thumbnailUrl}
                alt={recipe.title}
                className="object-cover w-full h-full"
              />
            </div>

            {/* Title and Channel */}
            <h2 className="text-lg font-semibold">{recipe.title}</h2>
            <p className="text-sm text-gray-600 mb-2">Channel: {recipe.channel}</p>

            {/* 🔥 Expanded content */}
            {isExpanded && (
              <div className="mt-4 space-y-4">
                {/* YouTube embedded video */}
                {/* <div className="aspect-w-16 aspect-h-9 rounded overflow-hidden">
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title={recipe.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div> */}

                {/* Recipe Summary */}
                {/* {recipe.summary ? (
                  <p className="text-sm text-gray-700">{recipe.summary}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">No summary available.</p>
                )} */}

                {/* Ingredients List */}
                {Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-800">
                    {recipe.ingredients.map((ingredient, idx) => (
                      <li key={idx}>{ingredient}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400 italic">Ingredients not available.</p>
                )}
              </div>
            )}

            {/* Add to Grocery List Button */}
            <button
              onClick={(e) => handleAddToGroceryList(e, recipe)}
              className="mt-3 bg-blue-500 text-white px-4 py-2 rounded"
            >
              Add to Grocery List
            </button>
          </div>
        );
      })}
    </div>
  );
}