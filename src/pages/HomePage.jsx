import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { GroceryCartIcon } from '../components/icons/GroceryCartIcon';
import { HeartIcon } from '../components/icons/HeartIcon';

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
      .order('created_at', { ascending: false });

    if (data) setRecipes(data);
    if (error) console.error('❌ Fetch error:', error);

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
      alert(`✅ Resync complete.\n\nSynced: ${syncResult.added || 0} new recipes.\nEnriched: ${enrichResult.updated || 0} recipes.\n\n🔄 Please refresh the page to see the latest updates.`);
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

      await supabase.from('events').insert([{ action: 'add_to_grocery_list', recipe_id: recipe.id }]);
      alert('Groceries added.');
    } catch (err) {
      console.error('❌ Unexpected error:', err);
      alert('Something went wrong.');
    }
  }

  return (
    <div className="p-4">
      <button
        onClick={handleResync}
        disabled={resyncing}
        className={`mb-4 px-4 py-2 rounded text-white ${resyncing ? 'bg-purple-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
      >
        {resyncing ? 'Resyncing…' : 'Resync & Enrich'}
      </button>

      <h1 className="text-2xl font-bold mb-4">Saved Recipes</h1>

      {loading ? (
        <p className="text-center">Loading…</p>
      ) : recipes.length === 0 ? (
        <p className="text-center text-gray-600">No recipes yet. Try syncing!</p>
      ) : (
        <div className="max-w-md mx-auto bg-white">
          {recipes.map((recipe) => {
            const videoId = recipe.video_url?.split('v=')[1];
            const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            const isExpanded = expandedId === recipe.id;

            return (
              <div
                key={recipe.id}
                className="bg-white border-t border-gray-200"
              >
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">{recipe.channel}</div>
                  </div>
                </div>

                <img
                  src={thumbnailUrl}
                  alt={recipe.title}
                  className="w-full aspect-square object-cover"
                />

                <div className="flex items-center justify-between px-4 pt-1">
                  <div className="flex gap-4">
                    <span className="inline-flex items-center">
                      <HeartIcon className="w-5 h-5" />
                    </span>
                    <button
                      onClick={(e) => handleAddToGroceryList(e, recipe)}
                      className="hover:scale-110 transition inline-flex items-center"
                      title="Add to Grocery List"
                    >
                      <GroceryCartIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="px-4 pt-1 text-sm">
                  <span className="font-semibold">{recipe.title}</span>
                </div>

                {!isExpanded && (
                  <div className="px-4 pt-1">
                    <button
                      onClick={() => setExpandedId(recipe.id)}
                      className="text-sm text-gray-500 hover:underline"
                    >
                      View all ingredients
                    </button>
                  </div>
                )}

                {isExpanded && (
                  <>
                    <div className="px-4 pt-1 text-sm text-gray-800">
                      {Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 ? (
                        <ul className="list-disc list-inside space-y-1">
                          {recipe.ingredients.map((i, idx) => (
                            <li key={idx}>{i}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="italic text-gray-400">Ingredients not available.</p>
                      )}
                    </div>
                    <div className="px-4 pt-1">
                      <button
                        onClick={() => setExpandedId(null)}
                        className="text-sm text-gray-500 hover:underline"
                      >
                        Hide ingredients
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
