/**
 * Instagram Graph API integration (server-only).
 *
 * Reads credentials from project secrets:
 *   INSTAGRAM_ACCESS_TOKEN
 *   INSTAGRAM_ACCOUNT_ID
 *
 * Public entry points:
 *   testInstagramConnection() — verify token + account
 *   fetchInstagramMedia()    — GET /{ig-user}/media
 *   fetchInstagramComments() — GET /{media-id}/comments (paginated)
 *   syncInstagramForUser()   — full workflow:
 *       fetch media -> fetch comments -> normalize -> upsert comments
 *       -> enqueue sync_jobs (DeepSeek runs in background drainer)
 *       -> audit_logs (sync.started | sync.completed | sync.failed)
 *       -> platform_health observation
 *       -> platform_connections status/cursor
 *
 * Never imported by client code. Lives under src/server/* which the
 * client bundle blocks by path. Load with `await import(...)` from
 * server-fn handlers.
 */

const GRAPH = "https://graph.instagram.com/v20.0";

type SBClient = { from: (t: string) => any };

export interface InstagramCreds {
  token: string;
  accountId: string;
}

export interface InstagramAccountInfo {
  id: string;
  username: string;
  name?: string | null;
}

export interface InstagramMedia {
  id: string;
  caption: string | null;
  permalink: string | null;
  timestamp: string;
}

export interface InstagramComment {
  external_comment_id: string;
  external_media_id: string;
  author: string;
  text: string;
  timestamp: string;
  permalink: string | null;
}

export interface SyncStats {
  imported: number;
  skipped: number;
  failed: number;
  media_count: number;
  comment_count: number;
  duration_ms: number;
  errors: string[];
}

export type ConnectionTestResult =
  | { ok: true; status: "connected"; account: InstagramAccountInfo }
  | {
      ok: false;
      status: "not_configured" | "invalid_token" | "invalid_account" | "rate_limited" | "error";
      error: string;
    };

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

export function loadInstagramCreds(): InstagramCreds | null {
  const rawToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const rawId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!rawToken || !rawId) return null;
  return { token: cleanToken(rawToken), accountId: cleanScalar(rawId) };
}

function cleanScalar(v: string): string {
  return v
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[\r\n\t]/g, "");
}

function cleanToken(v: string): string {
  let t = cleanScalar(v);
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "");
  if (/^oauth\s+/i.test(t)) t = t.replace(/^oauth\s+/i, "");
  return t;
}

export interface TokenDiagnostics {
  token_present: boolean;
  token_prefix: string | null;
  token_length: number;
  token_had_whitespace: boolean;
  token_had_quotes: boolean;
  token_had_bearer_prefix: boolean;
  token_had_newlines: boolean;
  token_charset_ok: boolean;
  account_id_present: boolean;
  account_id: string | null;
  account_id_numeric: boolean;
  secret_name: "INSTAGRAM_ACCESS_TOKEN";
  account_secret_name: "INSTAGRAM_ACCOUNT_ID";
}

export function diagnoseInstagramCreds(): TokenDiagnostics {
  const raw = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
  const rawId = process.env.INSTAGRAM_ACCOUNT_ID ?? "";
  const cleaned = cleanToken(raw);
  const cleanedId = cleanScalar(rawId);
  const d: TokenDiagnostics = {
    token_present: !!raw,
    token_prefix: cleaned ? cleaned.slice(0, 5) : null,
    token_length: cleaned.length,
    token_had_whitespace: raw !== raw.trim(),
    token_had_quotes: /^["']|["']$/.test(raw.trim()),
    token_had_bearer_prefix: /^(bearer|oauth)\s+/i.test(raw.trim()),
    token_had_newlines: /[\r\n]/.test(raw),
    token_charset_ok: /^[A-Za-z0-9_\-.]+$/.test(cleaned),
    account_id_present: !!rawId,
    account_id: cleanedId || null,
    account_id_numeric: /^\d+$/.test(cleanedId),
    secret_name: "INSTAGRAM_ACCESS_TOKEN",
    account_secret_name: "INSTAGRAM_ACCOUNT_ID",
  };
  console.log("[instagram] creds diagnostics", d);
  return d;
}

// ---------------------------------------------------------------------------
// Test connection
// ---------------------------------------------------------------------------

export interface GraphErrorShape {
  message?: string;
  code?: number;
  type?: string;
  error_subcode?: number;
  fbtrace_id?: string;
}
export async function testInstagramConnection(): Promise<
  ConnectionTestResult & { diagnostics?: TokenDiagnostics; graph_error?: GraphErrorShape }
> {
  const diagnostics = diagnoseInstagramCreds();
  const creds = loadInstagramCreds();
  if (!creds) {
    return {
      ok: false,
      status: "not_configured",
      error: "Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_ACCOUNT_ID",
      diagnostics,
    };
  }
  try {
    const url = `${GRAPH}/${encodeURIComponent(creds.accountId)}?fields=id,username,name&access_token=${encodeURIComponent(creds.token)}`;
    const res = await fetch(url);
    if (res.status === 429)
      return { ok: false, status: "rate_limited", error: "Instagram rate limit reached", diagnostics };
    const json = (await res.json()) as {
      id?: string;
      username?: string;
      name?: string;
      error?: { message?: string; code?: number; type?: string; error_subcode?: number; fbtrace_id?: string };
    };
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      const code = json.error?.code ?? 0;
      console.warn("[instagram] graph error", { code, msg, fbtrace_id: json.error?.fbtrace_id });
      if ([190, 102, 463, 467].includes(code))
        return { ok: false, status: "invalid_token", error: msg, diagnostics, graph_error: json.error };
      if ([100, 803].includes(code))
        return { ok: false, status: "invalid_account", error: msg, diagnostics, graph_error: json.error };
      return { ok: false, status: "error", error: msg, diagnostics, graph_error: json.error };
    }
    if (!json.id || !json.username) {
      return { ok: false, status: "invalid_account", error: "Instagram account not resolvable", diagnostics };
    }
    return {
      ok: true,
      status: "connected",
      account: { id: json.id, username: json.username, name: json.name ?? null },
    };
  } catch (e) {
    return { ok: false, status: "error", error: (e as Error).message, diagnostics };
  }
}

// ---------------------------------------------------------------------------
// Fetch media
// ---------------------------------------------------------------------------

export async function fetchInstagramMedia(limit = 25): Promise<InstagramMedia[]> {
  const creds = loadInstagramCreds();
  if (!creds) return [];
  const url = `${GRAPH}/${encodeURIComponent(creds.accountId)}/media?fields=id,caption,permalink,timestamp&limit=${limit}&access_token=${encodeURIComponent(creds.token)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`media fetch failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: Array<{ id: string; caption?: string; permalink?: string; timestamp?: string }>;
  };
  return (json.data ?? []).map((m) => ({
    id: m.id,
    caption: m.caption ?? null,
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? new Date().toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Fetch comments (per media, paginated)
// ---------------------------------------------------------------------------

export async function fetchInstagramComments(mediaId: string, maxPages = 5): Promise<InstagramComment[]> {
  const creds = loadInstagramCreds();
  if (!creds) return [];
  const out: InstagramComment[] = [];
  let url: string | null =
    `${GRAPH}/${encodeURIComponent(mediaId)}/comments?fields=id,username,text,timestamp&limit=50&access_token=${encodeURIComponent(creds.token)}`;
  let pages = 0;
  while (url && pages < maxPages) {
    const res: Response = await fetch(url);
    if (res.status === 429) throw new Error("rate_limited");
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`comments fetch failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string; username?: string; text?: string; timestamp?: string }>;
      paging?: { next?: string };
    };
    for (const c of json.data ?? []) {
      out.push({
        external_comment_id: c.id,
        external_media_id: mediaId,
        author: c.username ? `@${c.username}` : "Unknown",
        text: c.text ?? "",
        timestamp: c.timestamp ?? new Date().toISOString(),
        permalink: null,
      });
    }
    url = json.paging?.next ?? null;
    pages++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Audit + health helpers
// ---------------------------------------------------------------------------

async function audit(
  supabase: SBClient,
  userId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert({
      user_id: userId,
      actor_id: userId,
      action,
      entity_type: "platform_sync",
      entity_id: null,
      metadata: { platform: "instagram", ...metadata, source: "instagram_integration" },
    });
  } catch {
    /* audit must never break sync */
  }
}

async function recordHealth(
  supabase: SBClient,
  userId: string,
  status: "healthy" | "degraded" | "down",
  payload: {
    latency_ms?: number;
    error_rate?: number;
    success_count?: number;
    error_count?: number;
    last_error?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from("platform_health").insert({
      user_id: userId,
      platform: "instagram",
      status,
      latency_ms: payload.latency_ms ?? null,
      error_rate: payload.error_rate ?? null,
      success_count: payload.success_count ?? 0,
      error_count: payload.error_count ?? 0,
      last_error: payload.last_error ?? null,
      observed_at: new Date().toISOString(),
      metadata: payload.metadata ?? {},
    });
  } catch {
    /* health is observational */
  }
}

// ---------------------------------------------------------------------------
// Full sync workflow
// ---------------------------------------------------------------------------

export async function syncInstagramForUser(
  supabase: SBClient,
  userId: string,
): Promise<SyncStats & { ok: boolean; reason: "ok" | "not_configured" | "rate_limited" | "error"; error?: string }> {
  const started = Date.now();
  const stats: SyncStats = {
    imported: 0,
    skipped: 0,
    failed: 0,
    media_count: 0,
    comment_count: 0,
    duration_ms: 0,
    errors: [],
  };

  const creds = loadInstagramCreds();
  if (!creds) {
    await audit(supabase, userId, "sync.failed", { reason: "not_configured" });
    await recordHealth(supabase, userId, "down", { last_error: "not_configured", error_count: 1 });
    await supabase
      .from("platform_connections")
      .upsert(
        { user_id: userId, platform: "instagram", status: "disconnected", last_error: "Not configured" },
        { onConflict: "user_id,platform" },
      );
    return {
      ...stats,
      ok: false,
      reason: "not_configured",
      error: "Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_ACCOUNT_ID",
    };
  }

  await audit(supabase, userId, "sync.started", { account_id: creds.accountId });
  await supabase
    .from("platform_connections")
    .upsert({ user_id: userId, platform: "instagram", status: "syncing" }, { onConflict: "user_id,platform" });

  // Load prior cursor (newest comment timestamp from last run) for incremental filtering.
  const { data: prior } = await supabase
    .from("platform_connections")
    .select("sync_cursor")
    .eq("user_id", userId)
    .eq("platform", "instagram")
    .maybeSingle();
  const sinceIso: string | null = (prior?.sync_cursor as string | null) ?? null;
  let newestSeen: string | null = sinceIso;

  let media: InstagramMedia[] = [];
  try {
    media = await fetchInstagramMedia(25);
    stats.media_count = media.length;
  } catch (e) {
    const msg = (e as Error).message;
    stats.errors.push(`media: ${msg}`);
    await audit(supabase, userId, "sync.failed", { stage: "media", error: msg });
    await recordHealth(supabase, userId, "down", { last_error: msg, error_count: 1, metadata: { stage: "media" } });
    await supabase
      .from("platform_connections")
      .upsert(
        {
          user_id: userId,
          platform: "instagram",
          status: "error",
          last_error: msg,
          last_sync_at: new Date().toISOString(),
        },
        { onConflict: "user_id,platform" },
      );
    stats.duration_ms = Date.now() - started;
    return { ...stats, ok: false, reason: "error", error: msg };
  }

  const allComments: InstagramComment[] = [];
  let rateLimited = false;
  for (const m of media) {
    try {
      const cs = await fetchInstagramComments(m.id, 5);
      for (const c of cs) {
        if (sinceIso && c.timestamp <= sinceIso) continue;
        c.permalink = m.permalink;
        allComments.push(c);
        if (!newestSeen || c.timestamp > newestSeen) newestSeen = c.timestamp;
      }
    } catch (e) {
      const msg = (e as Error).message;
      stats.failed++;
      stats.errors.push(`media ${m.id}: ${msg}`);
      if (msg === "rate_limited") {
        rateLimited = true;
        break;
      }
    }
  }
  stats.comment_count = allComments.length;

  // Upsert into the unified comments table. The unique
  // (user_id, platform, external_id) constraint guarantees idempotency —
  // existing comments are skipped via ignoreDuplicates.
  if (allComments.length) {
    const rows = allComments.map((c) => ({
      user_id: userId,
      platform: "instagram",
      author: c.author,
      text: c.text,
      external_id: c.external_comment_id,
      post_id: c.external_media_id,
      permalink: c.permalink,
      created_at: c.timestamp,
    }));
    const { error, count } = await supabase
      .from("comments")
      .upsert(rows, { onConflict: "user_id,platform,external_id", count: "exact", ignoreDuplicates: true });
    if (error) {
      const msg = (error as { message?: string }).message ?? "comments upsert failed";
      stats.errors.push(`db: ${msg}`);
      await audit(supabase, userId, "sync.failed", { stage: "upsert", error: msg });
      await recordHealth(supabase, userId, "down", { last_error: msg, error_count: 1, metadata: { stage: "upsert" } });
      await supabase
        .from("platform_connections")
        .upsert(
          {
            user_id: userId,
            platform: "instagram",
            status: "error",
            last_error: msg,
            last_sync_at: new Date().toISOString(),
          },
          { onConflict: "user_id,platform" },
        );
      stats.duration_ms = Date.now() - started;
      return { ...stats, ok: false, reason: "error", error: msg };
    }
    stats.imported = count ?? 0;
    stats.skipped = allComments.length - stats.imported;

    // Enqueue moderation jobs for freshly inserted comments. The existing
    // background drainer (process-jobs cron) handles DeepSeek + ai_analysis
    // + review_queue + audit_logs.
    try {
      const externalIds = allComments.map((c) => c.external_comment_id);
      const { data: fresh } = await supabase
        .from("comments")
        .select("id")
        .eq("user_id", userId)
        .eq("platform", "instagram")
        .in("external_id", externalIds);
      const ids = (fresh ?? []).map((x: { id: string }) => x.id);
      if (ids.length) {
        const { enqueueModerateComments } = await import("@/lib/jobs/pipeline.server");
        await enqueueModerateComments(supabase, userId, ids);
      }
    } catch {
      /* enqueue must not break sync */
    }
  }

  const duration = Date.now() - started;
  stats.duration_ms = duration;
  const status = rateLimited ? "rate_limited" : stats.failed > 0 ? "degraded" : "healthy";
  const reason = rateLimited ? "rate_limited" : "ok";

  await supabase.from("platform_connections").upsert(
    {
      user_id: userId,
      platform: "instagram",
      status: rateLimited ? "rate_limited" : "connected",
      last_sync_at: new Date().toISOString(),
      last_error: stats.errors[0] ?? null,
      imported_count: stats.imported,
      sync_cursor: newestSeen,
    },
    { onConflict: "user_id,platform" },
  );

  await recordHealth(
    supabase,
    userId,
    status === "healthy" ? "healthy" : status === "rate_limited" ? "degraded" : "degraded",
    {
      latency_ms: duration,
      error_rate: stats.media_count ? stats.failed / Math.max(stats.media_count, 1) : 0,
      success_count: stats.imported,
      error_count: stats.failed,
      last_error: stats.errors[0] ?? null,
      metadata: { media_count: stats.media_count, comment_count: stats.comment_count },
    },
  );

  await audit(supabase, userId, rateLimited ? "sync.failed" : "sync.completed", {
    media_count: stats.media_count,
    comment_count: stats.comment_count,
    imported: stats.imported,
    skipped: stats.skipped,
    failed: stats.failed,
    duration_ms: duration,
    errors: stats.errors.slice(0, 5),
    rate_limited: rateLimited,
  });

  return { ...stats, ok: !rateLimited, reason, error: stats.errors[0] };
}

// ---------------------------------------------------------------------------
// Disconnect (clears credentials state, does not revoke remote token)
// ---------------------------------------------------------------------------

export async function disconnectInstagramForUser(supabase: SBClient, userId: string): Promise<void> {
  await supabase.from("platform_connections").upsert(
    {
      user_id: userId,
      platform: "instagram",
      status: "disconnected",
      last_error: null,
      sync_cursor: null,
    },
    { onConflict: "user_id,platform" },
  );
  await audit(supabase, userId, "sync.disconnected", {});
}
