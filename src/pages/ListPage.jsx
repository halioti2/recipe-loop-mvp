// ListPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function ListPage() {
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

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <main className="flex-1 p-4">
      <h1 className="text-2xl font-bold mb-4">Grocery List</h1>
      {Object.entries(groupedLists).map(([title, ingredients]) => (
        <div key={title} className="mb-6">
          <h2 className="text-xl font-semibold">{title}</h2>
          <ul className="list-disc list-inside">
            {ingredients.map((ingredient, idx) => (
              <li key={idx}>{ingredient}</li>
            ))}
          </ul>
        </div>
      ))}
    </main>
  );
}

export default ListPage;