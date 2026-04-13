import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useVoiceMode } from '../hooks/useVoiceMode';

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
  // Voice mode — pass transcript directly to submitQuestion, bypassing form/state timing
  const submitQuestionRef = useRef(null);

  const handleVoiceTranscript = useCallback((transcript) => {
    setInput(transcript); // show in input field
    // Submit directly — don't rely on React state flush + form requestSubmit
    setTimeout(() => submitQuestionRef.current?.(transcript), 0);
  }, []);

  const {
    voiceModeOn, isListening, isSpeaking,
    toggleVoiceMode, startListening, stopListening,
    speakText, error: voiceError,
  } = useVoiceMode({ onTranscript: handleVoiceTranscript });

  // TTS trigger: speak assistant response when voice mode is on
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current && !chatLoading && voiceModeOn && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === 'assistant') speakText(last.text);
    }
    prevLoadingRef.current = chatLoading;
  }, [chatLoading, voiceModeOn, messages, speakText]);

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

  async function submitQuestion(question) {
    if (!question.trim() || chatLoading) return;
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

  submitQuestionRef.current = submitQuestion;

  function handleChatSubmit(e) {
    e.preventDefault();
    submitQuestion(input);
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
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Ask about this recipe</h2>
        <button
          onClick={toggleVoiceMode}
          className={`p-2 rounded-full transition-colors ${
            voiceModeOn ? 'bg-purple-100 text-purple-600' : 'text-gray-400 hover:text-gray-600'
          }`}
          aria-label={voiceModeOn ? 'Turn off voice mode' : 'Turn on voice mode'}
          title={voiceModeOn ? 'Voice mode on' : 'Voice mode off'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            {voiceModeOn ? (
              <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
            ) : (
              <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM17.78 9.22a.75.75 0 10-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 001.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 101.06-1.06L20.56 12l1.72-1.72a.75.75 0 00-1.06-1.06l-1.72 1.72-1.72-1.72z" />
            )}
          </svg>
        </button>
      </div>
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
              placeholder={isListening ? 'Listening...' : 'Ask about this recipe...'}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              disabled={isListening}
            />
            {voiceModeOn && (
              <button
                type="button"
                onClick={isListening ? stopListening : startListening}
                disabled={chatLoading}
                className={`relative p-2 rounded-full transition-colors ${
                  isListening ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:text-gray-600'
                }`}
                aria-label={isListening ? 'Stop recording' : 'Start recording'}
              >
                {isListening && (
                  <span className="absolute inset-0 rounded-full animate-ping bg-red-400 opacity-25" />
                )}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 relative">
                  <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                  <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
                </svg>
              </button>
            )}
            <button
              type="submit"
              disabled={!input.trim() || chatLoading}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              →
            </button>
          </form>
          {voiceError && (
            <p className="text-xs text-red-500 mt-1">{voiceError}</p>
          )}
          {isListening && (
            <p className="text-xs text-gray-400 mt-1 animate-pulse">Listening... speak your question</p>
          )}
          {isSpeaking && (
            <p className="text-xs text-purple-500 mt-1">Speaking...</p>
          )}
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
