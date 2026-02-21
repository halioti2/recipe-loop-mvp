import { useYouTubeAuth } from '../hooks/useYouTubeAuth'

export function YouTubeConnectionStatus() {
  const { connected, loading, error, expiresIn, connectYouTube } = useYouTubeAuth()

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border rounded-lg">
        <div className="w-3 h-3 rounded-full bg-gray-400 animate-pulse"></div>
        <span className="text-sm text-gray-600">Checking YouTube connection...</span>
      </div>
    )
  }

  if (connected) {
    const days = expiresIn != null ? Math.floor(expiresIn / 86400) : null
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
        <div className="w-3 h-3 rounded-full bg-green-500"></div>
        <span className="text-sm text-green-800 font-medium">YouTube Connected</span>
        {days != null && (
          <span className="text-xs text-green-600 ml-1">
            · expires in {days > 0 ? `${days}d` : 'less than 1 day'}
          </span>
        )}
      </div>
    )
  }

  if (error === 'token_expired') {
    return (
      <div className="flex items-center justify-between gap-2 px-4 py-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <span className="text-sm text-yellow-800 font-medium">YouTube Connection Expired</span>
        </div>
        <button
          onClick={connectYouTube}
          className="text-xs px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors font-medium"
        >
          Reconnect
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 bg-gray-50 border rounded-lg">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-gray-400"></div>
        <span className="text-sm text-gray-600 font-medium">YouTube Not Connected</span>
      </div>
      <button
        onClick={connectYouTube}
        className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
      >
        Connect YouTube
      </button>
    </div>
  )
}
