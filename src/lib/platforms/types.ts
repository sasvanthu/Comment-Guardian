/**
 * Shared types for platform integration adapters.
 * Client-safe (no server-only imports). The actual adapter implementations
 * live in *.server.ts files and are only callable from server functions.
 */

export type PlatformId = "twitter" | "facebook" | "instagram" | "youtube";

export const PLATFORM_IDS: readonly PlatformId[] = ["twitter", "facebook", "instagram", "youtube"] as const;

export type ConnectionStatus =
  | "connected"
  | "syncing"
  | "rate_limited"
  | "error"
  | "disconnected";

/** Normalized comment shape produced by every adapter. */
export interface UnifiedComment {
  external_id: string;
  platform: PlatformId;
  author: string;
  text: string;
  created_at: string;
  post_id?: string | null;
  permalink?: string | null;
  language?: string | null;
}

/**
 * Incremental-sync state passed INTO an adapter.
 * - `since`: ISO timestamp of the prior successful sync (fallback filter)
 * - `cursor`: provider-native cursor from the previous run
 *   (Twitter: max tweet id seen; FB/IG: ISO of newest comment seen)
 */
export interface SyncState {
  since?: string | null;
  cursor?: string | null;
}

export interface SyncResult {
  ok: boolean;
  platform: PlatformId;
  reason?: "not_configured" | "rate_limited" | "error" | "ok";
  fetched: number;
  inserted: number;
  error?: string | null;
  rate_limit_remaining?: number | null;
  rate_limit_reset_at?: string | null;
  /** Cursor to persist for the next incremental run. */
  next_cursor?: string | null;
}
