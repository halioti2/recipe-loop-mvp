// ListPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function ListPage() {
  // Persist checkedItems in localStorage
  const [checkedItems, setCheckedItems] = useState(() => {
    try {
      const saved = localStorage.getItem('grocery_checked');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      console.error("Failed to parse checkedItems from localStorage", e);
      return {};
    }
  });
  const [listData, setListData] = useState([]);
  const [groupedLists, setGroupedLists] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchListData() {
      setLoading(true);
      const { data, error } = await supabase
        .from('lists')
        .select('id, ingredients, recipes(title)')
        .order('created_at', { ascending: true });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setListData(data);
      // Group by recipe title
      const groups = {};
      data.forEach(item => {
        const title = item.recipes?.title || "Unknown Recipe";
        if (!groups[title]) groups[title] = [];
        if (Array.isArray(item.ingredients)) {
          groups[title].push(...item.ingredients);
        }
      });
      setGroupedLists(groups);
      setLoading(false);
    }
    fetchListData();
  }, []);

  // Save checkedItems to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('grocery_checked', JSON.stringify(checkedItems));
    } catch (e) {
      console.error("Failed to save checkedItems to localStorage", e);
    }
  }, [checkedItems]);

  function handleCopyList() {
    let textToCopy = '';
    for (const [title, ingredients] of Object.entries(groupedLists)) {
      textToCopy += `${title}\n`;
      ingredients.forEach((ingredient) => {
        textToCopy += `- ${ingredient}\n`;
      });
      textToCopy += '\n'; // Extra newline between recipes
    }
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        alert('Grocery list copied to clipboard!');
      })
      .catch((err) => {
        console.error('Failed to copy text:', err);
        alert('Failed to copy.');
      });
  }

  async function handleResetList() {
    const confirmed = window.confirm('Are you sure you want to clear your grocery list?');
    if (!confirmed) return;
    try {
      // Step 1: Delete all rows in 'lists'
      const { error: deleteError } = await supabase
        .from('lists')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
      if (deleteError) {
        console.error('❌ Error clearing lists:', deleteError);
        alert('Failed to clear grocery list.');
        return;
      }
      // Step 2: Log reset event
      const { error: eventError } = await supabase
        .from('events')
        .insert([
          { action: 'reset' },
        ]);
      if (eventError) {
        console.error('❌ Error logging reset event:', eventError);
        // (non-critical; no need to block user)
      }
      // Step 3: Clear state
      setGroupedLists({});
      setCheckedItems({});
      alert('List cleared');
    } catch (err) {
      console.error('❌ Unexpected error during reset:', err);
      alert('Something went wrong.');
    }
  }

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <main className="flex-1 p-4">
      <h1 className="text-2xl font-bold mb-4">Grocery List</h1>
      <div className="flex gap-4 mb-4">
        <button
          onClick={handleCopyList}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Copy Grocery List
        </button>
        <button
          onClick={handleResetList}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          Reset Grocery List
        </button>
      </div>
      {Object.entries(groupedLists).map(([title, ingredients]) => (
        <div key={title} className="mb-6">
          <h2 className="text-xl font-semibold">{title}</h2>
          <ul className="space-y-2">
          {ingredients.map((ingredient, idx) => {
            const key = `${title}-${idx}`;
            const isChecked = checkedItems[key] || false;
            return (
              <li key={key} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={key}
                  className="w-4 h-4"
                  checked={isChecked}
                  onChange={() =>
                    setCheckedItems((prev) => ({
                      ...prev,
                      [key]: !prev[key],
                    }))
                  }
                />
                <label htmlFor={key} className={isChecked ? "line-through text-gray-400" : "text-sm"}>
                  {ingredient}
                </label>
              </li>
            );
          })}
        </ul>
        </div>
      ))}
    </main>
  );
}

export default ListPage;