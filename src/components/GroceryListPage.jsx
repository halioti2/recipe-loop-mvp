import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function GroceryListPage() {
  const [lists, setLists] = useState([])
  const [recipes, setRecipes] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [message, setMessage] = useState('')
  const { user } = useAuth()

  if (!user) {
    return <Navigate to="/login" replace />
  }

  useEffect(() => {
    fetchData()
  }, [user])

  const fetchData = async () => {
    try {
      const [listsData, recipesData] = await Promise.all([
        supabase
          .from('grocery_lists')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('recipes')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
      ])

      if (listsData.error) throw listsData.error
      if (recipesData.error) throw recipesData.error

      setLists(listsData.data || [])
      setRecipes(recipesData.data || [])
    } catch (error) {
      setMessage('Error loading data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const createList = async (e) => {
    e.preventDefault()
    if (!newListName.trim()) return

    setCreating(true)
    try {
      const { data, error } = await supabase
        .from('grocery_lists')
        .insert([{ 
          name: newListName.trim(),
          user_id: user.id
        }])
        .select()

      if (error) throw error

      setLists([data[0], ...lists])
      setNewListName('')
      setMessage('List created successfully!')
    } catch (error) {
      setMessage('Error creating list: ' + error.message)
    } finally {
      setCreating(false)
    }
  }

  const deleteList = async (listId) => {
    try {
      const { error } = await supabase
        .from('grocery_lists')
        .delete()
        .eq('id', listId)
        .eq('user_id', user.id)

      if (error) throw error

      setLists(lists.filter(list => list.id !== listId))
      setMessage('List deleted successfully!')
    } catch (error) {
      setMessage('Error deleting list: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">My Grocery Lists</h1>

      {/* Create new list */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Create New List</h2>
        <form onSubmit={createList} className="flex gap-4">
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="List name (e.g., Weekly Groceries)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !newListName.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create List'}
          </button>
        </form>
      </div>

      {message && (
        <div className="mb-4 p-4 rounded-md bg-blue-50 text-blue-700">
          {message}
        </div>
      )}

      {/* Lists grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {lists.map((list) => (
          <div key={list.id} className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-medium text-gray-900">{list.name}</h3>
              <button
                onClick={() => deleteList(list.id)}
                className="text-red-600 hover:text-red-800 text-sm"
              >
                Delete
              </button>
            </div>
            
            <div className="text-sm text-gray-500 mb-4">
              Created: {new Date(list.created_at).toLocaleDateString()}
            </div>
            
            {list.ingredients && (
              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Ingredients:</h4>
                <div className="space-y-1">
                  {JSON.parse(list.ingredients).slice(0, 3).map((ingredient, index) => (
                    <div key={index} className="text-sm text-gray-600">
                      • {ingredient}
                    </div>
                  ))}
                  {JSON.parse(list.ingredients).length > 3 && (
                    <div className="text-sm text-gray-500">
                      ... and {JSON.parse(list.ingredients).length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">
                {list.ingredients ? JSON.parse(list.ingredients).length : 0} items
              </span>
              {list.status && (
                <span className={`px-2 py-1 rounded-full text-xs ${
                  list.status === 'completed' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {list.status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {lists.length === 0 && (
        <div className="text-center py-12">
          <h3 className="text-lg font-medium text-gray-900 mb-2">No grocery lists yet</h3>
          <p className="text-gray-500">Create your first list above to get started!</p>
        </div>
      )}

      {/* Quick stats */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Stats</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-600">{lists.length}</div>
            <div className="text-sm text-gray-500">Total Lists</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{recipes.length}</div>
            <div className="text-sm text-gray-500">Your Recipes</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-600">
              {lists.filter(l => l.status === 'completed').length}
            </div>
            <div className="text-sm text-gray-500">Completed Lists</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">
              {lists.reduce((sum, l) => sum + (l.ingredients ? JSON.parse(l.ingredients).length : 0), 0)}
            </div>
            <div className="text-sm text-gray-500">Total Ingredients</div>
          </div>
        </div>
      </div>
    </div>
  )
}