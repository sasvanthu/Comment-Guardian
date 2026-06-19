const GRAPH = "https://graph.instagram.com/v20.0";

function cleanScalar(v) {
  return v
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[\r\n\t]/g, "");
}

function cleanToken(v) {
  let t = cleanScalar(v);
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "");
  if (/^oauth\s+/i.test(t)) t = t.replace(/^oauth\s+/i, "");
  return t;
}

function loadInstagramCreds() {
  const rawToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const rawId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!rawToken || !rawId) return null;
  return { token: cleanToken(rawToken), accountId: cleanScalar(rawId) };
}

function diagnoseInstagramCreds() {
  const raw = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
  const rawId = process.env.INSTAGRAM_ACCOUNT_ID ?? "";
  const cleaned = cleanToken(raw);
  const cleanedId = cleanScalar(rawId);
  return {
    token_present: !!raw,
    token_prefix: cleaned ? cleaned.slice(0, 5) : null,
    account_id_present: !!rawId,
    account_id: cleanedId || null,
  };
}

exports.testInstagramConnection = async () => {
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
    const json = await res.json();
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
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
    return { ok: false, status: "error", error: e.message, diagnostics };
  }
};

async function fetchInstagramMedia(limit = 25) {
  const creds = loadInstagramCreds();
  if (!creds) return [];
  const url = `${GRAPH}/${encodeURIComponent(creds.accountId)}/media?fields=id,caption,permalink,timestamp&limit=${limit}&access_token=${encodeURIComponent(creds.token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`media fetch failed (${res.status})`);
  const json = await res.json();
  return (json.data ?? []).map((m) => ({
    id: m.id,
    caption: m.caption ?? null,
    permalink: m.permalink ?? null,
    timestamp: m.timestamp ?? new Date().toISOString(),
  }));
}

async function fetchInstagramComments(mediaId, maxPages = 5) {
  const creds = loadInstagramCreds();
  if (!creds) return [];
  const out = [];
  let url = `${GRAPH}/${encodeURIComponent(mediaId)}/comments?fields=id,username,text,timestamp&limit=50&access_token=${encodeURIComponent(creds.token)}`;
  let pages = 0;
  while (url && pages < maxPages) {
    const res = await fetch(url);
    if (res.status === 429) throw new Error("rate_limited");
    if (!res.ok) throw new Error(`comments fetch failed (${res.status})`);
    const json = await res.json();
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

exports.syncInstagramForUser = async (supabase, userId) => {
  const started = Date.now();
  const stats = { imported: 0, skipped: 0, failed: 0, media_count: 0, comment_count: 0, duration_ms: 0, errors: [] };

  const creds = loadInstagramCreds();
  if (!creds) return { ...stats, ok: false, reason: "not_configured" };

  await supabase.from("platform_connections").upsert({ user_id: userId, platform: "instagram", status: "syncing" }, { onConflict: "user_id,platform" });

  const { data: prior } = await supabase.from("platform_connections").select("sync_cursor").eq("user_id", userId).eq("platform", "instagram").maybeSingle();
  const sinceIso = prior?.sync_cursor ?? null;
  let newestSeen = sinceIso;

  let media = [];
  try {
    media = await fetchInstagramMedia(25);
    stats.media_count = media.length;
  } catch (e) {
    return { ...stats, ok: false, reason: "error", error: e.message };
  }

  const allComments = [];
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
      stats.failed++;
      stats.errors.push(`media ${m.id}: ${e.message}`);
      if (e.message === "rate_limited") { rateLimited = true; break; }
    }
  }
  stats.comment_count = allComments.length;

  if (allComments.length) {
    const rows = allComments.map((c) => ({
      user_id: userId, platform: "instagram", author: c.author, text: c.text,
      external_id: c.external_comment_id, post_id: c.external_media_id, permalink: c.permalink, created_at: c.timestamp,
    }));
    const { error, count } = await supabase.from("comments").upsert(rows, { onConflict: "user_id,platform,external_id", count: "exact", ignoreDuplicates: true });
    if (error) {
      return { ...stats, ok: false, reason: "error", error: error.message };
    }
    stats.imported = count ?? 0;
    stats.skipped = allComments.length - stats.imported;

    try {
      const moderationService = require('./moderationService');
      await moderationService.run({ platform: 'instagram', comments: allComments });
    } catch (err) {
      console.warn('[instagram] Moderation run failed after sync', err.message);
    }
  }

  stats.duration_ms = Date.now() - started;
  await supabase.from("platform_connections").upsert({
    user_id: userId, platform: "instagram", status: rateLimited ? "rate_limited" : "connected",
    last_sync_at: new Date().toISOString(), imported_count: stats.imported, sync_cursor: newestSeen,
  }, { onConflict: "user_id,platform" });

  return { ...stats, ok: !rateLimited, reason: rateLimited ? "rate_limited" : "ok", error: stats.errors[0] };
};

exports.disconnectInstagramForUser = async (supabase, userId) => {
  await supabase.from("platform_connections").upsert({
    user_id: userId, platform: "instagram", status: "disconnected", last_error: null, sync_cursor: null,
  }, { onConflict: "user_id,platform" });
};

exports.fetchComments = async () => {
  const media = await fetchInstagramMedia(10);
  let allComments = [];
  for (const m of media) {
    try {
      const cs = await fetchInstagramComments(m.id, 2);
      allComments = allComments.concat(cs.map(c => ({
        id: c.external_comment_id,
        platform: 'instagram',
        author: c.author,
        text: c.text,
        timestamp: c.timestamp,
        postId: c.external_media_id,
      })));
    } catch (e) {
      console.warn('[instagram] failed to fetch comments for media', m.id, e.message);
    }
  }
  return allComments;
};

exports.deleteComment = async (id) => {
  const creds = loadInstagramCreds();
  if (!creds) throw new Error("No creds");
  const url = `${GRAPH}/${encodeURIComponent(id)}?access_token=${encodeURIComponent(creds.token)}`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`delete failed (${res.status})`);
  return { id, deleted: true };
};

exports.replyToComment = async (id, message) => {
  const creds = loadInstagramCreds();
  if (!creds) throw new Error("No creds");
  const url = `${GRAPH}/${encodeURIComponent(id)}/replies`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: creds.token }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`reply failed (${res.status}): ${err.error?.message || ''}`);
  }
  const data = await res.json();
  return { id, repliedId: data.id };
};

exports.hideComment = async (id) => {
  const creds = loadInstagramCreds();
  if (!creds) throw new Error("No creds");
  const url = `${GRAPH}/${encodeURIComponent(id)}?hide=true&access_token=${encodeURIComponent(creds.token)}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`hide failed (${res.status})`);
  return { id, hidden: true };
};

exports.unhideComment = async (id) => {
  const creds = loadInstagramCreds();
  if (!creds) throw new Error("No creds");
  const url = `${GRAPH}/${encodeURIComponent(id)}?hide=false&access_token=${encodeURIComponent(creds.token)}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) throw new Error(`unhide failed (${res.status})`);
  return { id, hidden: false };
};

exports.bulkDelete = async (ids = []) => {
  const results = [];
  for (const id of ids) {
    try {
      results.push(await exports.deleteComment(id));
    } catch (e) {
      results.push({ id, deleted: false, error: e.message });
    }
  }
  return results;
};
