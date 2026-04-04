import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

export default function GroceryListPage() {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [checkedItems, setCheckedItems] = useState(() => {
    try {
      const saved = localStorage.getItem('grocery_checked')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
  const { user } = useAuth()

  useEffect(() => {
    if (user) fetchLists()
  }, [user])

  useEffect(() => {
    try {
      localStorage.setItem('grocery_checked', JSON.stringify(checkedItems))
    } catch {}
  }, [checkedItems])

  const fetchLists = async () => {
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('id, ingredients, created_at, recipes(id, title)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      setLists(data || [])
    } catch (error) {
      setMessage('Error loading data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const deleteList = async (listId) => {
    try {
      const { error } = await supabase
        .from('lists')
        .delete()
        .eq('id', listId)
        .eq('user_id', user.id)

      if (error) throw error

      setLists(lists.filter(list => list.id !== listId))
      setMessage('Removed from grocery list.')
    } catch (error) {
      setMessage('Error removing list: ' + error.message)
    }
  }

  const handleCopyList = () => {
    let text = ''
    lists.forEach(list => {
      const title = list.recipes?.title || 'Unknown Recipe'
      text += `${title}\n`
      if (Array.isArray(list.ingredients)) {
        list.ingredients.forEach(ing => { text += `- ${ing}\n` })
      }
      text += '\n'
    })
    navigator.clipboard.writeText(text)
      .then(() => setMessage('Copied to clipboard!'))
      .catch(() => setMessage('Failed to copy.'))
  }

  const totalIngredients = lists.reduce((sum, l) =>
    sum + (Array.isArray(l.ingredients) ? l.ingredients.length : 0), 0)

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center">Loading...</div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Grocery List</h1>
        {lists.length > 0 && (
          <button
            onClick={handleCopyList}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm"
          >
            Copy All
          </button>
        )}
      </div>

      {message && (
        <div className="mb-4 p-4 rounded-md bg-blue-50 text-blue-700">
          {message}
        </div>
      )}

      {lists.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Your grocery list is empty</h3>
          <p className="text-gray-500">Add recipes to your list from your recipe collection.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {lists.map((list) => {
            const title = list.recipes?.title || 'Unknown Recipe'
            const ingredients = Array.isArray(list.ingredients) ? list.ingredients : []

            return (
              <div key={list.id} className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{title}</h3>
                    <div className="text-sm text-gray-500">
                      Added: {new Date(list.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteList(list.id)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>

                {ingredients.length > 0 && (
                  <ul className="space-y-2">
                    {ingredients.map((ingredient, idx) => {
                      const key = `${list.id}-${idx}`
                      const isChecked = checkedItems[key] || false
                      return (
                        <li key={key} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={key}
                            className="w-4 h-4"
                            checked={isChecked}
                            onChange={() =>
                              setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }))
                            }
                          />
                          <label
                            htmlFor={key}
                            className={isChecked ? 'line-through text-gray-400 text-sm' : 'text-sm text-gray-700'}
                          >
                            {ingredient}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}

      {lists.length > 0 && (
        <div className="mt-8 bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-indigo-600">{lists.length}</div>
              <div className="text-sm text-gray-500">Recipes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{totalIngredients}</div>
              <div className="text-sm text-gray-500">Total Ingredients</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
