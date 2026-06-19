/**
 * YouTube Service — Full OAuth 2.0 Integration
 *
 * Supports:
 *  - OAuth 2.0 authorization flow (consent URL → callback → token exchange)
 *  - Automatic access-token refresh via refresh token
 *  - Fetch comments (channel-wide or per-video)
 *  - Reply to comments
 *  - Delete / hide / publish comments (setModerationStatus)
 *  - Ban users from channel
 *  - List channel videos
 *  - Channel info (name, avatar, stats)
 *  - Sync to Supabase with moderation pipeline
 */
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const tokenStore = require('./tokenStore');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// --- OAuth config ---
function oauthConfig() {
  return {
    clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.YOUTUBE_OAUTH_REDIRECT_URI || 'http://localhost:5000/api/youtube/oauth/callback',
  };
}

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

// ─── OAuth Flow ──────────────────────────────────────────────────────────

/**
 * Generate Google OAuth consent URL.
 */
exports.getOAuthUrl = () => {
  const { clientId, redirectUri } = oauthConfig();
  if (!clientId) throw new Error('YOUTUBE_OAUTH_CLIENT_ID is not set');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

/**
 * Exchange authorization code for tokens. Stores them and fetches channel info.
 */
exports.handleOAuthCallback = async (code) => {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  if (!clientId || !clientSecret) throw new Error('YouTube OAuth credentials not configured');

  // 1. Exchange code for tokens
  const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const { access_token, refresh_token, expires_in } = tokenRes.data;
  const expires_at = Date.now() + (expires_in || 3600) * 1000;

  tokenStore.set('youtube', {
    access_token,
    refresh_token,
    expires_at,
  });

  // 2. Fetch channel info
  try {
    const channelInfo = await exports.getChannelInfo();
    tokenStore.set('youtube', {
      channel_id: channelInfo.id,
      channel_name: channelInfo.title,
      channel_avatar: channelInfo.avatar,
      subscriber_count: channelInfo.subscriberCount,
      video_count: channelInfo.videoCount,
    });
  } catch (err) {
    console.warn('[youtube] Failed to fetch channel info after OAuth:', err.message);
  }

  return { ok: true, message: 'YouTube connected successfully' };
};

/**
 * Get a valid access token, refreshing if expired.
 */
async function getValidAccessToken() {
  const stored = tokenStore.get('youtube');
  if (!stored || !stored.refresh_token) {
    throw new Error('YouTube not connected. Please authorize via OAuth first.');
  }

  // Return current token if still valid
  if (stored.access_token && !tokenStore.isExpired('youtube')) {
    return stored.access_token;
  }

  // Refresh the token
  const { clientId, clientSecret } = oauthConfig();
  const res = await axios.post('https://oauth2.googleapis.com/token', {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: stored.refresh_token,
    grant_type: 'refresh_token',
  });

  const { access_token, expires_in } = res.data;
  tokenStore.set('youtube', {
    access_token,
    expires_at: Date.now() + (expires_in || 3600) * 1000,
  });

  return access_token;
}

exports.getValidAccessToken = getValidAccessToken;

// ─── Connection Status ───────────────────────────────────────────────────

/**
 * Check if YouTube is connected via OAuth.
 */
exports.getConnectionStatus = () => {
  const stored = tokenStore.get('youtube');
  if (!stored || !stored.refresh_token) {
    return {
      connected: false,
      status: 'disconnected',
      message: 'YouTube not connected. Click "Connect YouTube" to authorize.',
    };
  }
  return {
    connected: true,
    status: 'connected',
    channel_id: stored.channel_id || null,
    channel_name: stored.channel_name || null,
    channel_avatar: stored.channel_avatar || null,
    subscriber_count: stored.subscriber_count || null,
    video_count: stored.video_count || null,
  };
};

/**
 * Disconnect YouTube — revoke token and clear store.
 */
exports.disconnectYoutube = async () => {
  const stored = tokenStore.get('youtube');
  if (stored && stored.access_token) {
    try {
      await axios.post(`https://oauth2.googleapis.com/revoke?token=${stored.access_token}`);
    } catch (err) {
      console.warn('[youtube] Token revocation failed (may already be invalid):', err.message);
    }
  }
  tokenStore.remove('youtube');
  return { ok: true, message: 'YouTube disconnected' };
};

// ─── Test Connection ─────────────────────────────────────────────────────

exports.testYoutubeConnection = async () => {
  const stored = tokenStore.get('youtube');
  if (!stored || !stored.refresh_token) {
    // Fallback: check API key config
    const apiKey = process.env.YOUTUBE_API_KEY;
    const channelId = process.env.YOUTUBE_CHANNEL_ID;
    if (!apiKey || !channelId) {
      return {
        ok: false,
        status: 'not_configured',
        error: 'YouTube not connected. Use "Connect YouTube" button to authorize via Google.',
        diagnostics: 'No OAuth tokens or API key configured',
      };
    }
    // Test API key
    try {
      const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { part: 'snippet', id: channelId, key: apiKey },
        timeout: 15000,
      });
      const channel = res.data?.items?.[0];
      if (!channel) return { ok: false, status: 'invalid_account', error: 'Channel not found' };
      return {
        ok: true,
        status: 'connected',
        method: 'api_key',
        account: { id: channelId, username: channel.snippet?.title || 'YouTube Channel' },
      };
    } catch (err) {
      return { ok: false, status: 'error', error: err.response?.data?.error?.message || err.message };
    }
  }

  // Test OAuth connection
  try {
    const info = await exports.getChannelInfo();
    return {
      ok: true,
      status: 'connected',
      method: 'oauth',
      account: {
        id: info.id,
        username: info.title,
        avatar: info.avatar,
        subscriberCount: info.subscriberCount,
        videoCount: info.videoCount,
      },
    };
  } catch (err) {
    return { ok: false, status: 'error', error: err.message };
  }
};

// ─── Channel Info ────────────────────────────────────────────────────────

/**
 * Fetch authenticated user's YouTube channel info.
 */
exports.getChannelInfo = async () => {
  const token = await getValidAccessToken();
  const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet,statistics,contentDetails', mine: true },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const channel = res.data?.items?.[0];
  if (!channel) throw new Error('No YouTube channel found for this account');

  return {
    id: channel.id,
    title: channel.snippet.title,
    description: channel.snippet.description,
    avatar: channel.snippet.thumbnails?.default?.url || channel.snippet.thumbnails?.medium?.url,
    subscriberCount: channel.statistics.subscriberCount,
    videoCount: channel.statistics.videoCount,
    viewCount: channel.statistics.viewCount,
    uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
  };
};

// ─── List Channel Videos ─────────────────────────────────────────────────

/**
 * List recent videos from the authenticated channel.
 */
exports.listChannelVideos = async (maxResults = 25, pageToken = null) => {
  const token = await getValidAccessToken();

  // First get the uploads playlist ID
  const channelInfo = await exports.getChannelInfo();
  const uploadsPlaylistId = channelInfo.uploadsPlaylistId;
  if (!uploadsPlaylistId) throw new Error('Could not find uploads playlist');

  const params = {
    part: 'snippet,contentDetails',
    playlistId: uploadsPlaylistId,
    maxResults,
  };
  if (pageToken) params.pageToken = pageToken;

  const res = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
    params,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const videos = (res.data?.items || []).map((item) => ({
    id: item.contentDetails.videoId,
    title: item.snippet.title,
    description: item.snippet.description?.substring(0, 200),
    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    publishedAt: item.snippet.publishedAt,
  }));

  // Fetch video statistics in batch
  if (videos.length) {
    try {
      const statsRes = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
        params: {
          part: 'statistics',
          id: videos.map((v) => v.id).join(','),
        },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });
      const statsMap = new Map((statsRes.data?.items || []).map((v) => [v.id, v.statistics]));
      for (const video of videos) {
        const stats = statsMap.get(video.id);
        if (stats) {
          video.viewCount = stats.viewCount;
          video.likeCount = stats.likeCount;
          video.commentCount = stats.commentCount;
        }
      }
    } catch (err) {
      console.warn('[youtube] Failed to fetch video stats:', err.message);
    }
  }

  return {
    videos,
    nextPageToken: res.data?.nextPageToken || null,
    totalResults: res.data?.pageInfo?.totalResults || 0,
  };
};

// ─── Fetch Comments ──────────────────────────────────────────────────────

/**
 * Fetch comments for a specific video.
 */
exports.listVideoComments = async (videoId, maxResults = 50, pageToken = null) => {
  const token = await getValidAccessToken();
  const params = {
    part: 'snippet,replies',
    videoId,
    maxResults,
    order: 'time',
    textFormat: 'plainText',
  };
  if (pageToken) params.pageToken = pageToken;

  const res = await axios.get('https://www.googleapis.com/youtube/v3/commentThreads', {
    params,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });

  const comments = (res.data?.items || []).map((thread) => {
    const top = thread.snippet.topLevelComment;
    return {
      id: top.id,
      threadId: thread.id,
      author: top.snippet.authorDisplayName,
      authorChannelId: top.snippet.authorChannelId?.value,
      authorAvatar: top.snippet.authorProfileImageUrl,
      text: top.snippet.textOriginal || top.snippet.textDisplay,
      likeCount: top.snippet.likeCount || 0,
      publishedAt: top.snippet.publishedAt,
      updatedAt: top.snippet.updatedAt,
      moderationStatus: top.snippet.moderationStatus || 'published',
      videoId,
      permalink: `https://www.youtube.com/watch?v=${videoId}&lc=${top.id}`,
      replyCount: thread.snippet.totalReplyCount || 0,
      replies: (thread.replies?.comments || []).map((r) => ({
        id: r.id,
        author: r.snippet.authorDisplayName,
        authorChannelId: r.snippet.authorChannelId?.value,
        authorAvatar: r.snippet.authorProfileImageUrl,
        text: r.snippet.textOriginal || r.snippet.textDisplay,
        likeCount: r.snippet.likeCount || 0,
        publishedAt: r.snippet.publishedAt,
      })),
    };
  });

  return {
    comments,
    nextPageToken: res.data?.nextPageToken || null,
    totalResults: res.data?.pageInfo?.totalResults || 0,
  };
};

/**
 * Fetch all recent comments across the channel (all videos).
 */
exports.fetchComments = async (maxResults = 50) => {
  // Try OAuth first
  if (tokenStore.hasTokens('youtube')) {
    try {
      const token = await getValidAccessToken();
      const stored = tokenStore.get('youtube');
      const channelId = stored?.channel_id;

      const res = await axios.get('https://www.googleapis.com/youtube/v3/commentThreads', {
        params: {
          part: 'snippet',
          allThreadsRelatedToChannelId: channelId,
          maxResults,
          order: 'time',
          textFormat: 'plainText',
        },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
      });

      return (res.data?.items || []).map((thread) => {
        const top = thread.snippet.topLevelComment;
        return {
          id: top.id,
          platform: 'youtube',
          author: top.snippet.authorDisplayName,
          authorId: top.snippet.authorChannelId?.value || top.snippet.authorDisplayName,
          authorAvatar: top.snippet.authorProfileImageUrl,
          text: top.snippet.textOriginal || top.snippet.textDisplay,
          timestamp: top.snippet.publishedAt,
          postId: top.snippet.videoId,
          permalink: `https://www.youtube.com/watch?v=${top.snippet.videoId}&lc=${top.id}`,
          moderationStatus: top.snippet.moderationStatus || 'published',
        };
      });
    } catch (err) {
      console.warn('[youtube] OAuth fetch failed, falling back to API key:', err.message);
    }
  }

  // Fallback: API key
  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  if (!apiKey || !channelId) return [];

  const response = await axios.get('https://www.googleapis.com/youtube/v3/commentThreads', {
    params: {
      part: 'snippet',
      allThreadsRelatedToChannelId: channelId,
      key: apiKey,
      maxResults,
      order: 'time',
    },
    timeout: 15000,
  });

  return (response.data?.items || []).map((thread) => {
    const top = thread.snippet.topLevelComment;
    return {
      id: top.id,
      platform: 'youtube',
      author: top.snippet.authorDisplayName,
      authorId: top.snippet.authorChannelId?.value || top.snippet.authorDisplayName,
      text: top.snippet.textOriginal || top.snippet.textDisplay,
      timestamp: top.snippet.publishedAt,
      postId: top.snippet.videoId,
      permalink: `https://www.youtube.com/watch?v=${top.snippet.videoId}&lc=${top.id}`,
    };
  });
};

// ─── Comment Actions ─────────────────────────────────────────────────────

/**
 * Reply to a comment.
 */
exports.replyToComment = async (parentId, text) => {
  const token = await getValidAccessToken();
  const res = await axios.post(
    'https://www.googleapis.com/youtube/v3/comments',
    {
      snippet: {
        parentId,
        textOriginal: text,
      },
    },
    {
      params: { part: 'snippet' },
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  return {
    ok: true,
    comment: {
      id: res.data.id,
      author: res.data.snippet.authorDisplayName,
      text: res.data.snippet.textOriginal || res.data.snippet.textDisplay,
      publishedAt: res.data.snippet.publishedAt,
    },
  };
};

/**
 * Set moderation status of a comment.
 * @param {string} commentId
 * @param {'published'|'heldForReview'|'rejected'} moderationStatus
 */
exports.setModerationStatus = async (commentId, moderationStatus) => {
  const token = await getValidAccessToken();
  await axios.post(
    'https://www.googleapis.com/youtube/v3/comments/setModerationStatus',
    null,
    {
      params: { id: commentId, moderationStatus, banAuthor: false },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    }
  );
  return { ok: true, id: commentId, moderationStatus };
};

/**
 * Delete a comment.
 */
exports.deleteComment = async (commentId) => {
  const token = await getValidAccessToken();
  await axios.delete('https://www.googleapis.com/youtube/v3/comments', {
    params: { id: commentId },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
  });
  return { ok: true, id: commentId, deleted: true };
};

/**
 * Bulk delete comments.
 */
exports.bulkDelete = async (ids = []) => {
  const results = [];
  for (const id of ids) {
    try {
      results.push(await exports.deleteComment(id));
    } catch (e) {
      results.push({ id, deleted: false, error: e.response?.data?.error?.message || e.message });
    }
  }
  return results;
};

/**
 * Ban a user from commenting on the channel.
 * Uses setModerationStatus with banAuthor=true on one of their comments.
 */
exports.banUser = async (commentId) => {
  const token = await getValidAccessToken();
  await axios.post(
    'https://www.googleapis.com/youtube/v3/comments/setModerationStatus',
    null,
    {
      params: { id: commentId, moderationStatus: 'rejected', banAuthor: true },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    }
  );
  return { ok: true, commentId, banned: true };
};

/**
 * Mark a comment as spam (held for review).
 */
exports.markAsSpam = async (commentId) => {
  return exports.setModerationStatus(commentId, 'heldForReview');
};

/**
 * Approve / publish a held comment.
 */
exports.approveComment = async (commentId) => {
  return exports.setModerationStatus(commentId, 'published');
};

// ─── Sync to Supabase ────────────────────────────────────────────────────

exports.syncYoutubeForUser = async (supabaseClient, userId) => {
  const started = Date.now();
  const stats = { imported: 0, skipped: 0, failed: 0, comment_count: 0, duration_ms: 0, errors: [] };

  // Check if connected
  if (!tokenStore.hasTokens('youtube') && !process.env.YOUTUBE_API_KEY) {
    return { ...stats, ok: false, platform: 'youtube', reason: 'not_configured' };
  }

  const client = supabaseClient || supabase;
  if (!client) {
    return { ...stats, ok: false, platform: 'youtube', reason: 'error', error: 'Supabase client not initialized' };
  }

  await client
    .from('platform_connections')
    .upsert({ user_id: userId, platform: 'youtube', status: 'syncing' }, { onConflict: 'user_id,platform' });

  const { data: prior } = await client
    .from('platform_connections')
    .select('sync_cursor')
    .eq('user_id', userId)
    .eq('platform', 'youtube')
    .maybeSingle();
  const sinceIso = prior?.sync_cursor ?? null;
  let newestSeen = sinceIso;

  let comments = [];
  try {
    comments = await exports.fetchComments();
    stats.comment_count = comments.length;
  } catch (e) {
    await client.from('platform_connections').upsert(
      { user_id: userId, platform: 'youtube', status: 'error', last_error: e.message },
      { onConflict: 'user_id,platform' }
    );
    return { ...stats, ok: false, platform: 'youtube', reason: 'error', error: e.message };
  }

  const newComments = [];
  for (const c of comments) {
    if (sinceIso && c.timestamp <= sinceIso) continue;
    newComments.push(c);
    if (!newestSeen || c.timestamp > newestSeen) newestSeen = c.timestamp;
  }

  if (newComments.length) {
    const rows = newComments.map((c) => ({
      user_id: userId,
      platform: 'youtube',
      author: c.author,
      text: c.text,
      external_id: c.id,
      post_id: c.postId,
      permalink: c.permalink,
      created_at: c.timestamp,
    }));

    const { error, count } = await client
      .from('comments')
      .upsert(rows, { onConflict: 'user_id,platform,external_id', count: 'exact', ignoreDuplicates: true });
    if (error) {
      return { ...stats, ok: false, platform: 'youtube', reason: 'error', error: error.message };
    }
    stats.imported = count ?? 0;
    stats.skipped = newComments.length - stats.imported;

    try {
      const moderationService = require('./moderationService');
      await moderationService.run({ platform: 'youtube', comments: newComments });
    } catch (err) {
      console.warn('[youtube] Moderation run failed after sync', err.message);
    }
  }

  stats.duration_ms = Date.now() - started;

  // Update connection info
  const connData = {
    user_id: userId,
    platform: 'youtube',
    status: 'connected',
    last_sync_at: new Date().toISOString(),
    imported_count: stats.imported,
    sync_cursor: newestSeen,
  };

  // Add channel info if available from OAuth
  const stored = tokenStore.get('youtube');
  if (stored?.channel_name) {
    connData.last_error = null; // clear any old errors
  }

  await client.from('platform_connections').upsert(connData, { onConflict: 'user_id,platform' });

  return { ...stats, ok: true, reason: 'ok' };
};

exports.disconnectYoutubeForUser = async (supabaseClient, userId) => {
  // Revoke OAuth tokens
  await exports.disconnectYoutube();

  const client = supabaseClient || supabase;
  if (!client) return;
  await client.from('platform_connections').upsert(
    { user_id: userId, platform: 'youtube', status: 'disconnected', last_error: null, sync_cursor: null },
    { onConflict: 'user_id,platform' }
  );
};
