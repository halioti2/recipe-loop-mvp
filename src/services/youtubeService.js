/**
 * YouTube Data API v3 Service
 * Handles all YouTube API interactions for playlist and video data
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

export class YouTubeService {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  /**
   * Fetch user's YouTube playlists
   * @param {number} maxResults - Maximum number of playlists to fetch (default: 25)
   * @returns {Promise<Array>} Array of playlist objects
   */
  async getUserPlaylists(maxResults = 25) {
    const url = new URL(`${YOUTUBE_API_BASE}/playlists`);
    url.searchParams.append('part', 'snippet,contentDetails,status');
    url.searchParams.append('mine', 'true');
    url.searchParams.append('maxResults', maxResults.toString());

    const response = await this._makeRequest(url);
    return response.items || [];
  }

  /**
   * Fetch videos from a specific playlist
   * @param {string} playlistId - YouTube playlist ID
   * @param {number} maxResults - Maximum number of videos to fetch (default: 50)
   * @returns {Promise<Array>} Array of video objects
   */
  async getPlaylistVideos(playlistId, maxResults = 50) {
    const url = new URL(`${YOUTUBE_API_BASE}/playlistItems`);
    url.searchParams.append('part', 'snippet,contentDetails');
    url.searchParams.append('playlistId', playlistId);
    url.searchParams.append('maxResults', maxResults.toString());

    const response = await this._makeRequest(url);
    return response.items || [];
  }

  /**
   * Get detailed information about specific videos
   * @param {Array<string>} videoIds - Array of YouTube video IDs
   * @returns {Promise<Array>} Array of video details
   */
  async getVideoDetails(videoIds) {
    if (!videoIds || videoIds.length === 0) return [];

    const url = new URL(`${YOUTUBE_API_BASE}/videos`);
    url.searchParams.append('part', 'snippet,contentDetails,statistics');
    url.searchParams.append('id', videoIds.join(','));

    const response = await this._makeRequest(url);
    return response.items || [];
  }

  /**
   * Get user's channel information
   * @returns {Promise<Object>} Channel information
   */
  async getUserChannel() {
    const url = new URL(`${YOUTUBE_API_BASE}/channels`);
    url.searchParams.append('part', 'snippet,statistics');
    url.searchParams.append('mine', 'true');

    const response = await this._makeRequest(url);
    return response.items?.[0] || null;
  }

  /**
   * Make authenticated request to YouTube API
   * @private
   */
  async _makeRequest(url) {
    if (!this.accessToken) {
      throw new YouTubeAPIError('No access token provided', 'MISSING_TOKEN');
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new YouTubeAPIError(
        `YouTube API error: ${response.status} ${response.statusText}`,
        'API_ERROR',
        {
          status: response.status,
          statusText: response.statusText,
          details: errorData
        }
      );
    }

    return await response.json();
  }

  /**
   * Check if the current token has required YouTube scopes
   * @returns {Promise<boolean>} True if token has YouTube read access
   */
  async validateToken() {
    try {
      await this.getUserChannel();
      return true;
    } catch (error) {
      if (error.code === 'API_ERROR' && error.details?.status === 403) {
        return false; // Insufficient permissions
      }
      throw error;
    }
  }
}

/**
 * Custom error class for YouTube API errors
 */
export class YouTubeAPIError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'YouTubeAPIError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Utility functions for YouTube data processing
 */
export const YouTubeUtils = {
  /**
   * Extract video ID from various YouTube URL formats
   * @param {string} url - YouTube URL
   * @returns {string|null} Video ID or null if not found
   */
  getVideoId(url) {
    if (!url || typeof url !== 'string') return null;
    
    const patterns = [
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
      /youtube\.com\/embed\/([^"&?\/\s]{11})/,
      /youtube\.com\/v\/([^"&?\/\s]{11})/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  },

  /**
   * Generate YouTube thumbnail URL
   * @param {string} videoId - YouTube video ID
   * @param {string} quality - Thumbnail quality ('default', 'medium', 'high', 'maxres')
   * @returns {string} Thumbnail URL
   */
  getThumbnailUrl(videoId, quality = 'hqdefault') {
    if (!videoId) return null;
    return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
  },

  /**
   * Check if a video title likely contains a recipe
   * @param {string} title - Video title
   * @returns {boolean} True if title suggests it's a recipe video
   */
  isLikelyRecipe(title) {
    if (!title) return false;
    
    const recipeKeywords = [
      'recipe', 'cooking', 'how to make', 'tutorial', 'bake', 'baking',
      'ingredients', 'cook', 'food', 'kitchen', 'meal', 'dish', 'preparation'
    ];
    
    const titleLower = title.toLowerCase();
    return recipeKeywords.some(keyword => titleLower.includes(keyword));
  },

  /**
   * Format duration from YouTube API format (PT4M13S) to readable format
   * @param {string} duration - ISO 8601 duration string
   * @returns {string} Formatted duration (e.g., "4:13")
   */
  formatDuration(duration) {
    if (!duration) return '';
    
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return '';
    
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
};