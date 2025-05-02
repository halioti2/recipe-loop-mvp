import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [resyncing, setResyncing] = useState(false);

  async function fetchRecipes() {
    setLoading(true);

    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false }); // 🔄 Newest first

    if (data) {
      setRecipes(data);
    }

    if (error) {
      console.error('❌ Fetch error:', error);
    }

    setLoading(false);
  }

  useEffect(() => {
    fetchRecipes();
  }, []);

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

    try {
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

      const { error: insertError } = await supabase
        .from('lists')
        .insert([{ recipe_id: recipe.id, ingredients: recipe.ingredients || [] }]);

      if (insertError) {
        console.error('❌ Error inserting into lists:', insertError);
        alert('Something went wrong. Try again.');
        return;
      }

      await supabase.from('events').insert([
        { action: 'add_to_grocery_list', recipe_id: recipe.id }
      ]);

      alert('Groceries added.');
    } catch (err) {
      console.error('❌ Unexpected error:', err);
      alert('Something went wrong.');
    }
  }

  return (
    <div className="p-4 space-y-4">
      {/* Always show sync button */}
      <button
        onClick={handleResync}
        disabled={resyncing}
        className={`mb-4 px-4 py-2 rounded text-white ${
          resyncing ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
        }`}
      >
        {resyncing ? 'Resyncing…' : 'Resync & Enrich'}
      </button>

      <h1 className="text-2xl font-bold mb-4">Saved Recipes</h1>

      {loading ? (
        <p className="text-center">Loading…</p>
      ) : recipes.length === 0 ? (
        <p className="text-center text-gray-600">No recipes yet. Try syncing!</p>
      ) : (
        recipes.map((recipe) => {
          const videoId = recipe.video_url?.split('v=')[1];
          const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          const isExpanded = expandedId === recipe.id;

          return (
            <div
              key={recipe.id}
              className="border p-4 rounded shadow hover:shadow-md transition max-w-sm mx-auto cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
            >
              <div className="aspect-w-16 aspect-h-9 mb-2 overflow-hidden rounded">
                <img
                  src={thumbnailUrl}
                  alt={recipe.title}
                  className="object-cover w-full h-full"
                />
              </div>

              <h2 className="text-lg font-semibold">{recipe.title}</h2>
              <p className="text-sm text-gray-600 mb-2">Channel: {recipe.channel}</p>

              {isExpanded && (
                <div className="mt-4 space-y-4">
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

              <button
                onClick={(e) => handleAddToGroceryList(e, recipe)}
                className="mt-3 bg-blue-500 text-white px-4 py-2 rounded"
              >
                Add to Grocery List
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
