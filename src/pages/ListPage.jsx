// ListPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

function ListPage() {
  const [listData, setListData] = useState([]);
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
      setLoading(false);
    }

    fetchListData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <main className="flex-1 p-4">
      <h1 className="text-2xl font-bold mb-4">Grocery List</h1>
      <pre className="text-sm bg-gray-100 p-2 rounded">
        {JSON.stringify(listData, null, 2)}
      </pre>
    </main>
  );
}

export default ListPage;