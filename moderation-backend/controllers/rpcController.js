const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn("Missing SUPABASE_URL or SUPABASE_KEY. Admin functions will fail.");
}

const supabaseAdmin = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// --- Admin ---
exports.listUsers = async (req, res, next) => {
  try {
    const { data: authUsers, error: aErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (aErr) throw new Error(aErr.message);

    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name, email");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");

    const profById = new Map((profiles || []).map((p) => [p.id, p]));
    const rolesById = new Map();
    for (const r of roles || []) {
      const arr = rolesById.get(r.user_id) || [];
      arr.push(r.role);
      rolesById.set(r.user_id, arr);
    }

    const users = authUsers.users.map((u) => ({
      id: u.id,
      email: u.email || null,
      display_name: profById.get(u.id)?.display_name || null,
      roles: rolesById.get(u.id) || [],
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at || null,
    }));
    users.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ users });
  } catch (e) { next(e); }
};

exports.createUser = async (req, res, next) => {
  try {
    const { email, password, display_name, role } = req.body;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { display_name: display_name || email.split("@")[0] },
    });
    if (error) throw new Error(error.message);
    const newId = created.user.id;
    if (role === "admin") {
      await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: "admin" });
    }
    res.json({ id: newId });
  } catch (e) { next(e); }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const { user_id } = req.body;
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.setUserRole = async (req, res, next) => {
  try {
    const { user_id, role, grant } = req.body;
    if (grant) {
      const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id, role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
      if (error) throw new Error(error.message);
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// --- Workflows ---
exports.listWorkflowRules = async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("workflow_rules").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (e) { next(e); }
};

exports.upsertWorkflowRule = async (req, res, next) => {
  try {
    const { id, name, description, conditions, action, action_config, is_enabled } = req.body;
    if (id) {
      const { data, error } = await supabaseAdmin.from("workflow_rules").update({ name, description, conditions, action, action_config, is_enabled }).eq("id", id).select().single();
      if (error) throw new Error(error.message);
      res.json(data);
    } else {
      const { data, error } = await supabaseAdmin.from("workflow_rules").insert({ name, description, conditions, action, action_config, is_enabled }).select().single();
      if (error) throw new Error(error.message);
      res.json(data);
    }
  } catch (e) { next(e); }
};

exports.toggleWorkflowRule = async (req, res, next) => {
  try {
    const { id, enabled } = req.body;
    const { error } = await supabaseAdmin.from("workflow_rules").update({ is_enabled: enabled }).eq("id", id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.deleteWorkflowRule = async (req, res, next) => {
  try {
    const { id } = req.body;
    const { error } = await supabaseAdmin.from("workflow_rules").delete().eq("id", id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.listWorkflowExecutions = async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from("workflow_executions").select("*").order("executed_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (e) { next(e); }
};

// --- AI & Utilities ---
const aiService = require('../services/aiService');

exports.analyzeToxic = async (req, res, next) => {
  try {
    const { text } = req.body;
    const result = await aiService.analyzeComment(text);
    // Map to frontend expected shape
    res.json({
      toxicity: result.toxicityScore,
      cyberbullyingProbability: result.toxicityScore > 60 ? 80 : 10,
      sentiment: result.sentiment,
      severity: result.toxic ? "High" : "Low",
      categories: result.categories,
      recommendedAction: result.decision === "allow" ? "Allow" : result.decision === "review" ? "Flag" : "Delete",
      confidence: result.confidence,
      reason: result.reason,
      signals: ["Mapped from aiService"],
    });
  } catch (e) { next(e); }
};

exports.translateText = async (req, res, next) => {
  try {
    const { text } = req.body;
    const result = await aiService.analyzeComment(text);
    res.json({ translation: result.translation, detectedLanguage: result.languageName });
  } catch (e) { next(e); }
};

exports.detectSpam = async (req, res, next) => {
  try {
    const { text } = req.body;
    const result = await aiService.analyzeComment(text);
    res.json({
      isSpam: result.categories.includes("spam") || result.categories.includes("scam"),
      confidence: result.confidence,
      reason: result.reason,
    });
  } catch (e) { next(e); }
};

exports.researchUser = async (req, res, next) => {
  try {
    // Dummy response since researchUser was complex AI call.
    res.json({
      riskLevel: "Low",
      riskScore: 10,
      profileType: "Benign user",
      summary: "User appears to be normal based on history.",
      patterns: ["Consistent positive interaction"],
      topCategories: ["safe"],
      evidence: [],
      recommendedAction: "Monitor",
      confidence: 90,
    });
  } catch (e) { next(e); }
};

// --- Platforms ---
exports.listPlatformConnections = async (req, res) => res.json([]);
exports.disconnectPlatform = async (req, res) => res.json({ ok: true });
exports.syncPlatform = async (req, res) => res.json({ status: "success", analyzed: 0, toxic: 0 });
exports.syncAllPlatforms = async (req, res) => res.json({ status: "success", analyzed: 0, toxic: 0 });

const facebookService = require('../services/facebookService');

exports.testFacebookConnection = async (req, res, next) => {
  try {
    const result = await facebookService.testFacebookConnection();
    res.json(result);
  } catch (e) { next(e); }
};

exports.syncFacebookNow = async (req, res, next) => {
  try {
    const result = await facebookService.syncFacebookForUser(supabaseAdmin, req.body.userId || "dummy-user");
    res.json(result);
  } catch (e) { next(e); }
};

exports.disconnectFacebook = async (req, res, next) => {
  try {
    await facebookService.disconnectFacebookForUser(supabaseAdmin, req.body.userId || "dummy-user");
    res.json({ ok: true });
  } catch (e) { next(e); }
};

const instagramService = require('../services/instagramService');

exports.testInstagramConnection = async (req, res, next) => {
  try {
    const result = await instagramService.testInstagramConnection();
    res.json(result);
  } catch (e) { next(e); }
};

exports.syncInstagramNow = async (req, res, next) => {
  try {
    const result = await instagramService.syncInstagramForUser(supabaseAdmin, req.body.userId || "dummy-user");
    res.json(result);
  } catch (e) { next(e); }
};

exports.disconnectInstagram = async (req, res, next) => {
  try {
    await instagramService.disconnectInstagramForUser(supabaseAdmin, req.body.userId || "dummy-user");
    res.json({ ok: true });
  } catch (e) { next(e); }
};

const youtubeService = require('../services/youtubeService');

exports.testYoutubeConnection = async (req, res, next) => {
  try {
    const result = await youtubeService.testYoutubeConnection();
    res.json(result);
  } catch (e) { next(e); }
};

exports.syncYoutubeNow = async (req, res, next) => {
  try {
    const result = await youtubeService.syncYoutubeForUser(supabaseAdmin, req.body.userId || "dummy-user");
    res.json(result);
  } catch (e) { next(e); }
};

exports.disconnectYoutube = async (req, res, next) => {
  try {
    await youtubeService.disconnectYoutubeForUser(supabaseAdmin, req.body.userId || "dummy-user");
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// --- Twitter ---
const twitterService = require('../services/twitterService');

exports.testTwitterConnection = async (req, res, next) => {
  try {
    const token = process.env.TWITTER_BEARER_TOKEN;
    if (!token) {
      return res.json({ ok: false, status: 'not_configured', error: 'Missing TWITTER_BEARER_TOKEN' });
    }
    // Quick connectivity test: try fetching user info
    const api = axios.create({
      baseURL: 'https://api.twitter.com/2',
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    const meRes = await api.get('/users/me');
    if (meRes.status >= 400) {
      return res.json({ ok: false, status: 'error', error: `API returned ${meRes.status}` });
    }
    const user = meRes.data?.data;
    res.json({
      ok: true,
      status: 'connected',
      account: { id: user?.id, username: user?.username || user?.name },
    });
  } catch (e) {
    const msg = e.response?.data?.detail || e.response?.data?.title || e.message;
    res.json({ ok: false, status: 'error', error: msg });
  }
};

exports.syncTwitterNow = async (req, res, next) => {
  try {
    const token = process.env.TWITTER_BEARER_TOKEN;
    if (!token) return res.json({ ok: false, reason: 'not_configured' });

    const userId = req.body.userId || 'dummy-user';
    const started = Date.now();

    await supabaseAdmin.from('platform_connections').upsert(
      { user_id: userId, platform: 'twitter', status: 'syncing' },
      { onConflict: 'user_id,platform' }
    );

    let comments = [];
    try {
      comments = await twitterService.fetchComments({ maxPosts: 5, maxPages: 2 });
    } catch (e) {
      await supabaseAdmin.from('platform_connections').upsert(
        { user_id: userId, platform: 'twitter', status: 'error', last_error: e.message },
        { onConflict: 'user_id,platform' }
      );
      return res.json({ ok: false, reason: 'error', error: e.message, imported: 0, skipped: 0, failed: 0, comment_count: 0 });
    }

    let imported = 0, skipped = 0;
    if (comments.length) {
      const rows = comments.map((c) => ({
        user_id: userId,
        platform: 'twitter',
        author: c.author,
        text: c.text,
        external_id: c.id,
        post_id: c.postId,
        permalink: null,
        created_at: c.timestamp,
      }));
      const { error, count } = await supabaseAdmin.from('comments').upsert(rows, {
        onConflict: 'user_id,platform,external_id', count: 'exact', ignoreDuplicates: true,
      });
      if (error) return res.json({ ok: false, reason: 'error', error: error.message });
      imported = count ?? 0;
      skipped = comments.length - imported;

      try {
        const moderationService = require('../services/moderationService');
        await moderationService.run({ platform: 'twitter', comments });
      } catch (err) {
        console.warn('[twitter] Moderation run failed after sync', err.message);
      }
    }

    await supabaseAdmin.from('platform_connections').upsert({
      user_id: userId, platform: 'twitter', status: 'connected',
      last_sync_at: new Date().toISOString(), imported_count: imported,
    }, { onConflict: 'user_id,platform' });

    res.json({ ok: true, reason: 'ok', imported, skipped, failed: 0, comment_count: comments.length, duration_ms: Date.now() - started });
  } catch (e) { next(e); }
};

exports.disconnectTwitter = async (req, res, next) => {
  try {
    const userId = req.body.userId || 'dummy-user';
    await supabaseAdmin.from('platform_connections').upsert({
      user_id: userId, platform: 'twitter', status: 'disconnected', last_error: null, sync_cursor: null,
    }, { onConflict: 'user_id,platform' });
    res.json({ ok: true });
  } catch (e) { next(e); }
};

exports.executePlatformActions = async (req, res, next) => {
  try {
    const { actions } = req.body;
    if (!Array.isArray(actions)) {
      return res.status(400).json({ error: "actions must be an array" });
    }

    const results = [];
    for (const action of actions) {
      const { platform, externalId, action: type } = action;
      if (!platform || !externalId || !type) {
        results.push({ externalId, success: false, error: "Missing required fields" });
        continue;
      }

      let svc;
      if (platform === 'twitter') svc = twitterService;
      else if (platform === 'facebook') svc = facebookService;
      else if (platform === 'instagram') svc = instagramService;
      else if (platform === 'youtube') svc = youtubeService;
      else {
        results.push({ externalId, success: false, error: `Unknown platform: ${platform}` });
        continue;
      }

      try {
        if (type === 'delete' && svc.deleteComment) {
          await svc.deleteComment(externalId);
          results.push({ externalId, success: true });
        } else if (type === 'hide' && svc.hideComment) {
          await svc.hideComment(externalId);
          results.push({ externalId, success: true });
        } else if (type === 'approve') {
          // 'approve' maps to unhide or publish
          if (svc.unhideComment) {
            await svc.unhideComment(externalId);
            results.push({ externalId, success: true });
          } else if (svc.approveComment) {
            await svc.approveComment(externalId);
            results.push({ externalId, success: true });
          } else {
            results.push({ externalId, success: false, error: `Unsupported action 'approve' for platform '${platform}'` });
          }
        } else if (type === 'block') {
          // 'block' maps to banUser
          if (svc.banUser) {
            await svc.banUser(externalId);
            results.push({ externalId, success: true });
          } else {
            // Ignore for platforms that don't support API ban natively yet
            results.push({ externalId, success: false, error: `Unsupported action 'block' for platform '${platform}'` });
          }
        } else {
          results.push({ externalId, success: false, error: `Unsupported action '${type}' for platform '${platform}'` });
        }
      } catch (err) {
        console.error(`[rpc] Platform action failed: ${platform} ${type} ${externalId}`, err.message);
        results.push({ externalId, success: false, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (e) { next(e); }
};
