import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { ingName, ingCategory, CATEGORY_ORDER, CATEGORY_LABELS } from '../lib/ingredients'

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
        .select('id, ingredients, created_at, recipes(id, title, ingredients)')
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

  const writeToClipboard = (text) => {
    if (!text) {
      setMessage('Nothing to copy — all items are checked.')
      return
    }
    navigator.clipboard.writeText(text)
      .then(() => setMessage('Copied to clipboard!'))
      .catch(() => setMessage('Failed to copy.'))
  }

  // Prefer the recipe's current ingredients (which include category data after
  // enrichment) over the snapshot stored on the list at add-time.
  const ingredientsForList = (list) => {
    const fresh = list.recipes?.ingredients
    if (Array.isArray(fresh) && fresh.length > 0) return fresh
    return Array.isArray(list.ingredients) ? list.ingredients : []
  }

  const itemKey = (list, ing) => `${list.id}::${ingName(ing).toLowerCase()}`

  const handleCopyList = () => {
    let text = ''
    lists.forEach(list => {
      const title = list.recipes?.title || 'Unknown Recipe'
      const ingredients = ingredientsForList(list)
      const unchecked = ingredients.filter(ing => !checkedItems[itemKey(list, ing)])
      if (unchecked.length === 0) return
      text += `${title}\n`
      unchecked.forEach(ing => { text += `- ${ingName(ing)}\n` })
      text += '\n'
    })
    writeToClipboard(text)
  }

  const handleCopyRecipe = (list) => {
    const title = list.recipes?.title || 'Unknown Recipe'
    const ingredients = ingredientsForList(list)
    const unchecked = ingredients.filter(ing => !checkedItems[itemKey(list, ing)])
    if (unchecked.length === 0) {
      setMessage('Nothing to copy — all items in this recipe are checked.')
      return
    }
    let text = `${title}\n`
    unchecked.forEach(ing => { text += `- ${ingName(ing)}\n` })
    writeToClipboard(text)
  }

  // Aggregate all ingredients across lists, bucketed by category. Includes
  // checked state so the view can show strike-through and toggle either way.
  const groupedByCategory = (() => {
    const buckets = Object.fromEntries(CATEGORY_ORDER.map(c => [c, []]))
    lists.forEach(list => {
      const recipeTitle = list.recipes?.title || 'Unknown Recipe'
      ingredientsForList(list).forEach(ing => {
        const key = itemKey(list, ing)
        const cat = ingCategory(ing)
        buckets[cat].push({
          key,
          name: ingName(ing),
          recipeTitle,
          isChecked: !!checkedItems[key],
        })
      })
    })
    CATEGORY_ORDER.forEach(c => {
      buckets[c].sort((a, b) => a.name.localeCompare(b.name))
    })
    return buckets
  })()

  const handleCopyByCategory = () => {
    let text = ''
    CATEGORY_ORDER.forEach(cat => {
      const items = groupedByCategory[cat].filter(i => !i.isChecked)
      if (items.length === 0) return
      text += `${CATEGORY_LABELS[cat]}\n`
      items.forEach(({ name }) => { text += `- ${name}\n` })
      text += '\n'
    })
    writeToClipboard(text)
  }

  const totalIngredients = lists.reduce((sum, l) => sum + ingredientsForList(l).length, 0)

  const aggregateHasItems = CATEGORY_ORDER.some(c => groupedByCategory[c].length > 0)

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
            const ingredients = ingredientsForList(list)

            return (
              <div key={list.id} className="bg-white shadow rounded-lg p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">{title}</h3>
                    <div className="text-sm text-gray-500">
                      Added: {new Date(list.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCopyRecipe(list)}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md text-xs"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => deleteList(list.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                {ingredients.length > 0 && (() => {
                  const buckets = Object.fromEntries(CATEGORY_ORDER.map(c => [c, []]))
                  ingredients.forEach(ing => {
                    buckets[ingCategory(ing)].push({ name: ingName(ing), key: itemKey(list, ing) })
                  })
                  CATEGORY_ORDER.forEach(c =>
                    buckets[c].sort((a, b) => a.name.localeCompare(b.name))
                  )
                  return (
                    <div className="space-y-3">
                      {CATEGORY_ORDER.map(cat => {
                        const items = buckets[cat]
                        if (items.length === 0) return null
                        return (
                          <div key={cat}>
                            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                              {CATEGORY_LABELS[cat]}
                            </h4>
                            <ul className="space-y-1">
                              {items.map(({ name, key }) => {
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
                                      {name}
                                    </label>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}

      {lists.length > 0 && (
        <div className="mt-8 bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-gray-900">Shopping List by Section</h3>
            <button
              onClick={handleCopyByCategory}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md text-xs"
            >
              Copy
            </button>
          </div>
          {aggregateHasItems ? (
            <div className="space-y-4">
              {CATEGORY_ORDER.map(cat => {
                const items = groupedByCategory[cat]
                if (items.length === 0) return null
                return (
                  <div key={cat}>
                    <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">
                      {CATEGORY_LABELS[cat]} ({items.filter(i => !i.isChecked).length})
                    </h4>
                    <ul className="space-y-1">
                      {items.map(({ key, name, recipeTitle, isChecked }) => (
                        <li key={`agg-${key}`} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            className="w-4 h-4"
                            checked={isChecked}
                            onChange={() =>
                              setCheckedItems(prev => ({ ...prev, [key]: !prev[key] }))
                            }
                          />
                          <span className={isChecked ? 'text-sm text-gray-400 line-through' : 'text-sm text-gray-700'}>
                            {name}
                            <span className="text-xs text-gray-400 ml-2">({recipeTitle})</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No ingredients yet.</p>
          )}
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
