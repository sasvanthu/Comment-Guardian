// Dummy youtubeService for now

function loadYoutubeCreds() {
  const rawToken = process.env.YOUTUBE_API_KEY;
  const rawId = process.env.YOUTUBE_CHANNEL_ID;
  if (!rawToken || !rawId) return null;
  return { token: rawToken.trim(), channelId: rawId.trim() };
}

exports.testYoutubeConnection = async () => {
  const creds = loadYoutubeCreds();
  if (!creds) {
    return {
      ok: false,
      status: "invalid_account",
      error: "Missing YOUTUBE_API_KEY or YOUTUBE_CHANNEL_ID",
      diagnostics: "Please configure secrets"
    };
  }
  // Dummy success for now
  return {
    ok: true,
    account: { id: creds.channelId, username: "Dummy YouTube Channel" },
    diagnostics: "Dummy valid response"
  };
};

exports.syncYoutubeForUser = async (supabase, userId) => {
  const creds = loadYoutubeCreds();
  if (!creds) {
    return { ok: false, platform: "youtube", reason: "not_configured" };
  }

  try {
    await supabase.from("platform_connections").upsert({ user_id: userId, platform: "youtube", status: "syncing" }, { onConflict: "user_id,platform" });

    // Dummy sync logic
    const imported = 0;
    const skipped = 0;
    const failed = 0;

    await supabase.from("platform_connections").update({
      status: "connected",
      last_sync_at: new Date().toISOString(),
      imported_count: imported
    }).eq("user_id", userId).eq("platform", "youtube");

    return {
      ok: true,
      platform: "youtube",
      reason: "ok",
      imported,
      skipped,
      failed,
      video_count: 0,
      comment_count: 0
    };
  } catch (err) {
    console.error("[youtube] sync error:", err);
    await supabase.from("platform_connections").update({
      status: "error",
      last_error: err.message
    }).eq("user_id", userId).eq("platform", "youtube");
    return { ok: false, platform: "youtube", error: err.message };
  }
};

exports.disconnectYoutubeForUser = async (supabase, userId) => {
  await supabase.from("platform_connections").update({
    status: "disconnected", last_error: null, sync_cursor: null,
  }).eq("user_id", userId).eq("platform", "youtube");
};

exports.fetchComments = async () => {
  return [];
};

