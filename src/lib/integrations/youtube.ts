/**
 * YouTube Integration — Frontend API Client
 *
 * All YouTube API calls go through the moderation backend.
 * OAuth flow uses a popup window that posts a message back on completion.
 */
import axios from "axios";

const API = "http://localhost:5000/api/youtube";

// ─── OAuth Flow ──────────────────────────────────────────────────────────

/** Get the Google OAuth consent URL */
export async function getYoutubeOAuthUrl(): Promise<string> {
  const res = await axios.get(`${API}/oauth/url`);
  return res.data.url;
}

/**
 * Open the YouTube OAuth popup and wait for it to complete.
 * Returns a promise that resolves on success or rejects on error/close.
 */
export function connectYoutubeOAuth(): Promise<{ ok: boolean }> {
  return new Promise(async (resolve, reject) => {
    try {
      const url = await getYoutubeOAuthUrl();
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        url,
        "youtube-oauth",
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes`
      );

      if (!popup) {
        reject(new Error("Popup was blocked. Please allow popups for this site."));
        return;
      }

      // Listen for postMessage from the callback page
      const handler = (event: MessageEvent) => {
        if (event.data?.type === "youtube-oauth-success") {
          window.removeEventListener("message", handler);
          clearInterval(pollClose);
          resolve({ ok: true });
        } else if (event.data?.type === "youtube-oauth-error") {
          window.removeEventListener("message", handler);
          clearInterval(pollClose);
          reject(new Error(event.data.error || "OAuth authorization failed"));
        }
      };
      window.addEventListener("message", handler);

      // Also poll to detect if user closed the popup manually
      const pollClose = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClose);
          window.removeEventListener("message", handler);
          // Give a small delay in case postMessage fired right before close
          setTimeout(() => reject(new Error("Authorization window was closed")), 300);
        }
      }, 500);
    } catch (err) {
      reject(err);
    }
  });
}

// ─── Connection Status ───────────────────────────────────────────────────

export interface YoutubeConnectionStatus {
  connected: boolean;
  status: string;
  channel_id?: string;
  channel_name?: string;
  channel_avatar?: string;
  subscriber_count?: string;
  video_count?: string;
}

export async function getYoutubeConnectionStatus(): Promise<YoutubeConnectionStatus> {
  const res = await axios.get(`${API}/connection-status`);
  return res.data;
}

export async function disconnectYoutube(): Promise<void> {
  await axios.post(`${API}/disconnect`);
}

// ─── Test / Sync (legacy RPC endpoints) ──────────────────────────────────

const RPC = "http://localhost:5000/api/rpc";

export async function testYoutubeConnection() {
  const res = await axios.post(`${RPC}/testYoutubeConnection`, {});
  return res.data;
}

export async function syncYoutubeNow() {
  const res = await axios.post(`${RPC}/syncYoutubeNow`, {});
  return res.data;
}

// ─── Channel Info ────────────────────────────────────────────────────────

export interface YoutubeChannelInfo {
  id: string;
  title: string;
  description: string;
  avatar: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
}

export async function getYoutubeChannelInfo(): Promise<YoutubeChannelInfo> {
  const res = await axios.get(`${API}/channel`);
  return res.data;
}

// ─── Videos ──────────────────────────────────────────────────────────────

export interface YoutubeVideo {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
}

export async function getYoutubeVideos(
  maxResults = 25,
  pageToken?: string
): Promise<{ videos: YoutubeVideo[]; nextPageToken: string | null; totalResults: number }> {
  const params: Record<string, any> = { maxResults };
  if (pageToken) params.pageToken = pageToken;
  const res = await axios.get(`${API}/videos`, { params });
  return res.data;
}

// ─── Comments ────────────────────────────────────────────────────────────

export interface YoutubeComment {
  id: string;
  threadId?: string;
  author: string;
  authorChannelId?: string;
  authorAvatar?: string;
  text: string;
  likeCount: number;
  publishedAt: string;
  updatedAt?: string;
  moderationStatus?: string;
  videoId?: string;
  permalink?: string;
  replyCount?: number;
  replies?: YoutubeComment[];
}

export async function getYoutubeComments(): Promise<{ comments: any[]; count: number }> {
  const res = await axios.get(`${API}/comments`);
  return res.data;
}

export async function getVideoComments(
  videoId: string,
  maxResults = 50,
  pageToken?: string
): Promise<{ comments: YoutubeComment[]; nextPageToken: string | null; totalResults: number }> {
  const params: Record<string, any> = { maxResults };
  if (pageToken) params.pageToken = pageToken;
  const res = await axios.get(`${API}/videos/${videoId}/comments`, { params });
  return res.data;
}

// ─── Comment Actions ─────────────────────────────────────────────────────

export async function replyToYoutubeComment(
  commentId: string,
  text: string
): Promise<{ ok: boolean; comment: any }> {
  const res = await axios.post(`${API}/comments/${commentId}/reply`, { text });
  return res.data;
}

export async function moderateYoutubeComment(
  commentId: string,
  status: "published" | "heldForReview" | "rejected"
): Promise<{ ok: boolean }> {
  const res = await axios.put(`${API}/comments/${commentId}/moderate`, { status });
  return res.data;
}

export async function deleteYoutubeComment(commentId: string): Promise<{ ok: boolean }> {
  const res = await axios.delete(`${API}/comments/${commentId}`);
  return res.data;
}

export async function bulkDeleteYoutubeComments(ids: string[]): Promise<{ results: any[] }> {
  const res = await axios.post(`${API}/comments/bulk-delete`, { ids });
  return res.data;
}

export async function banYoutubeUser(commentId: string): Promise<{ ok: boolean }> {
  const res = await axios.post(`${API}/comments/${commentId}/ban-user`);
  return res.data;
}

export async function approveYoutubeComment(commentId: string): Promise<{ ok: boolean }> {
  const res = await axios.post(`${API}/comments/${commentId}/approve`);
  return res.data;
}

export async function markYoutubeCommentAsSpam(commentId: string): Promise<{ ok: boolean }> {
  const res = await axios.post(`${API}/comments/${commentId}/spam`);
  return res.data;
}
