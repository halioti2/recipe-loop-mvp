import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';

function getVideoId(recipe) {
  if (recipe.youtube_video_id) return recipe.youtube_video_id;
  if (recipe.video_url) {
    const match = recipe.video_url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
    return match ? match[1] : null;
  }
  return null;
}

export default function RecipePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [inList, setInList] = useState(false);
  const [addingToList, setAddingToList] = useState(false);
  const [activeTab, setActiveTab] = useState('recipe');

  // Chat state
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    async function fetchRecipe() {
      setLoading(true);
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id)
        .single();

      if (error) setError(error.message);
      else setRecipe(data);
      setLoading(false);
    }

    async function checkInList() {
      if (!user) return;
      const { data } = await supabase
        .from('lists')
        .select('id')
        .eq('recipe_id', id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setInList(true);
    }

    fetchRecipe();
    checkInList();
  }, [id, user]);

  async function handleAddToGroceryList() {
    if (!user || inList) return;
    setAddingToList(true);
    try {
      const { error } = await supabase
        .from('lists')
        .insert([{
          recipe_id: recipe.id,
          ingredients: recipe.ingredients || [],
          user_id: user.id,
        }]);

      if (error) { alert('Something went wrong. Try again.'); return; }

      await supabase.from('events').insert([{
        action: 'add_to_grocery_list',
        recipe_id: recipe.id,
        user_id: user.id,
      }]);

      setInList(true);
    } catch {
      alert('Something went wrong.');
    } finally {
      setAddingToList(false);
    }
  }

  async function handleChatSubmit(e) {
    e.preventDefault();
    if (!input.trim() || chatLoading) return;

    const question = input.trim();
    setInput('');
    const updatedMessages = [...messages, { role: 'user', text: question }];
    setMessages(updatedMessages);
    setChatLoading(true);

    try {
      const res = await fetch('/.netlify/functions/recipe-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          transcript: recipe.transcript,
          history: messages,
        }),
      });

      const data = await res.json();
      if (data.answer) {
        setMessages([...updatedMessages, { role: 'assistant', text: data.answer }]);
      } else {
        setMessages([...updatedMessages, { role: 'assistant', text: 'Sorry, something went wrong. Try again.' }]);
      }
    } catch {
      setMessages([...updatedMessages, { role: 'assistant', text: 'Sorry, something went wrong. Try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link to="/" className="text-purple-600 hover:underline text-sm">← Back to Recipes</Link>
        <p className="mt-6 text-gray-500">Recipe not found.</p>
      </div>
    );
  }

  const videoId = getVideoId(recipe);
  const hasTranscript = !!recipe.transcript;

  const recipeContent = (
    <div className="space-y-6">
      {recipe.ingredients?.length > 0 ? (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Ingredients</h2>
          <ul className="space-y-1">
            {recipe.ingredients.map((ingredient, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                {ingredient}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">Ingredients not available.</p>
      )}
    </div>
  );

  const chatPanel = (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Ask about this recipe</h2>
      {hasTranscript ? (
        <>
          <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-0">
            {messages.length === 0 && (
              <p className="text-sm text-gray-400 italic">Ask anything about this recipe — ingredients, technique, substitutions...</p>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-sm px-4 py-2 rounded-2xl text-sm ${
                    msg.role === 'user'
                      ? 'bg-purple-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-2 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1 items-center h-4">
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this recipe..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
            <button
              type="submit"
              disabled={!input.trim() || chatLoading}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              →
            </button>
          </form>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-400 italic text-center">
            Chat unavailable — no transcript for this video.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <Link to="/" className="text-purple-600 hover:underline text-sm">← Back to Recipes</Link>
        <button
          onClick={handleAddToGroceryList}
          disabled={inList || addingToList}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${
            inList
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {inList ? 'In Grocery List' : addingToList ? 'Adding…' : 'Add to Grocery List'}
        </button>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">{recipe.title}</h1>
      <p className="text-sm text-gray-500 mb-6">{recipe.channel}</p>

      {/* Video */}
      {videoId ? (
        <div className="w-full aspect-video rounded-xl overflow-hidden bg-black mb-6">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title={recipe.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          />
        </div>
      ) : (
        <div className="w-full aspect-video rounded-xl bg-gray-100 flex items-center justify-center mb-6">
          <p className="text-gray-400 text-sm">Video unavailable</p>
        </div>
      )}

      {/* Mobile: tab bar below video */}
      <div className="md:hidden">
        <div className="flex border-b border-gray-200 mb-4 sticky top-0 bg-white z-10">
          <button
            onClick={() => setActiveTab('recipe')}
            className={`flex-1 py-2 text-sm font-medium ${
              activeTab === 'recipe'
                ? 'border-b-2 border-purple-600 text-purple-600'
                : 'text-gray-500'
            }`}
          >
            Recipe
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 text-sm font-medium ${
              activeTab === 'chat'
                ? 'border-b-2 border-purple-600 text-purple-600'
                : 'text-gray-500'
            }`}
          >
            Chat
          </button>
        </div>
        {activeTab === 'recipe' ? (
          <>
            {recipeContent}
            <button
              onClick={handleAddToGroceryList}
              disabled={inList || addingToList}
              className={`mt-6 w-full py-3 rounded-lg text-sm font-medium ${
                inList
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {inList ? 'In Grocery List' : addingToList ? 'Adding…' : 'Add to Grocery List'}
            </button>
          </>
        ) : (
          <div className="flex flex-col" style={{ height: 'calc(100vh - 300px)' }}>
            {chatPanel}
          </div>
        )}
      </div>

      {/* Desktop: two-column */}
      <div className="hidden md:grid md:grid-cols-2 md:gap-8">
        <div>{recipeContent}</div>
        <div className="flex flex-col" style={{ height: '500px' }}>
          {chatPanel}
        </div>
      </div>
    </div>
  );
}
