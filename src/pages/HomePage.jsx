import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState([]);
  const [expandedId, setExpandedId] = useState(null); // 🔥 New: Track which recipe is expanded

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

  // Handle adding recipe to grocery list
async function handleAddToGroceryList(e, recipe) {
  e.stopPropagation(); // 🔥 Prevent the card from toggling expanded/collapsed

  try {
    // Step 1: Check if recipe is already in lists
    const { data: existing, error: checkError } = await supabase
      .from('lists')
      .select('id')
      .eq('recipe_id', recipe.id)
      .maybeSingle(); // Only expect one result

    if (checkError) {
      console.error('❌ Error checking lists:', checkError);
      alert('Something went wrong. Try again.');
      return;
    }

    if (existing) {
      alert('Already added.');
      return;
    }

    // Step 2: Insert into lists
    const { error: insertError } = await supabase
      .from('lists')
      .insert([{ recipe_id: recipe.id }]);

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
          event_type: 'add_to_grocery_list',
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

  return (
    <div className="p-4 space-y-4">
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

            {/* 🔥 Expanded content: Ingredients only */}
            {isExpanded && (
              <div className="mt-4">
                <h3 className="text-md font-bold mb-2">Ingredients:</h3>

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
