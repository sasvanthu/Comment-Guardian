/**
 * Moderation pipeline — Phase 2 (server-only).
 *
 *   comment created/upserted
 *     -> enqueueModerateComments() inserts sync_jobs(job_type='moderate_comment')
 *     -> background drainer (cron) calls drainModerationJobs()
 *        -> DeepSeek analysis
 *        -> ai_analysis insert (extended fields)
 *        -> review_queue insert when thresholds exceeded
 *        -> audit_logs entries (analysis.completed | analysis.failed
 *           | review.created | moderation.action)
 *        -> retry / dead-letter on failure
 *
 * Designed for `supabaseAdmin` (service role, bypasses RLS).
 */
import {
  analyzeWithDeepSeek,
  exceedsReviewThreshold,
  type DeepSeekAnalysis,
} from "../ai/deepseek.server";

type SBClient = { from: (t: string) => any };

const LOCKER = "drain:moderation";
const BATCH_SIZE = 10;
const CONCURRENCY = 3;
const STALE_LOCK_MIN = 10;
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200]; // 30s, 2m, 10m, 30m, 2h
const MAX_ATTEMPTS = 5;

function commentStatusFor(a: DeepSeekAnalysis): "allowed" | "flagged" | "hidden" {
  if (a.recommendation === "hide") return "hidden";
  if (a.recommendation === "flag") return "flagged";
  return "allowed";
}

function reviewPriority(a: DeepSeekAnalysis): "low" | "medium" | "high" | "critical" {
  return a.priority;
}

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export async function enqueueModerateComments(
  supabase: SBClient,
  userId: string,
  commentIds: string[],
): Promise<number> {
  if (!commentIds.length) return 0;
  // Filter ids that already have analysis to avoid duplicate work.
  const { data: existing } = await supabase
    .from("ai_analysis")
    .select("comment_id")
    .in("comment_id", commentIds);
  const done = new Set((existing ?? []).map((r: { comment_id: string }) => r.comment_id));

  // Also avoid duplicate queued jobs for the same comment.
  const { data: queued } = await supabase
    .from("sync_jobs")
    .select("related_comment_id")
    .eq("user_id", userId)
    .eq("job_type", "moderate_comment")
    .in("status", ["queued", "running"])
    .in("related_comment_id", commentIds);
  const inFlight = new Set(
    (queued ?? []).map((r: { related_comment_id: string }) => r.related_comment_id),
  );

  const rows = commentIds
    .filter((id) => !done.has(id) && !inFlight.has(id))
    .map((id) => ({
      user_id: userId,
      job_type: "moderate_comment",
      status: "queued" as const,
      payload: { comment_id: id },
      related_comment_id: id,
      scheduled_for: new Date().toISOString(),
      next_attempt_at: new Date().toISOString(),
    }));
  if (!rows.length) return 0;
  const { error } = await supabase.from("sync_jobs").insert(rows);
  if (error) return 0;
  return rows.length;
}

// ---------------------------------------------------------------------------
// Drainer
// ---------------------------------------------------------------------------

interface JobRow {
  id: string;
  user_id: string;
  job_type: string;
  payload: Record<string, unknown>;
  attempts: number;
  retry_count: number;
  max_attempts: number;
  related_comment_id: string | null;
}

async function claimJobs(supabase: SBClient, limit: number): Promise<JobRow[]> {
  const now = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MIN * 60 * 1000).toISOString();

  // Recycle stuck "running" jobs whose lock is stale.
  await supabase
    .from("sync_jobs")
    .update({ status: "queued", locked_at: null, locked_by: null })
    .eq("status", "running")
    .lt("locked_at", staleCutoff);

  const { data: candidates } = await supabase
    .from("sync_jobs")
    .select("id, user_id, job_type, payload, attempts, retry_count, max_attempts, related_comment_id")
    .eq("status", "queued")
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  const ids = (candidates ?? []).map((c: { id: string }) => c.id);
  if (!ids.length) return [];

  // Best-effort optimistic lock — update only rows still queued.
  const { data: locked } = await supabase
    .from("sync_jobs")
    .update({
      status: "running",
      locked_at: now,
      locked_by: LOCKER,
      started_at: now,
    })
    .in("id", ids)
    .eq("status", "queued")
    .select("id, user_id, job_type, payload, attempts, retry_count, max_attempts, related_comment_id");

  return (locked as JobRow[]) ?? [];
}

async function appendAudit(
  supabase: SBClient,
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await supabase.from("audit_logs").insert({
    user_id: userId,
    actor_id: null, // system actor
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata: { ...metadata, source: "moderation_pipeline" },
  });
}

async function finishOk(
  supabase: SBClient,
  jobId: string,
  result: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("sync_jobs")
    .update({
      status: "succeeded",
      result,
      finished_at: now,
      locked_at: null,
      locked_by: null,
      failure_reason: null,
    })
    .eq("id", jobId);
}

async function finishFail(
  supabase: SBClient,
  job: JobRow,
  error: string,
): Promise<void> {
  const nextRetry = job.retry_count + 1;
  const maxAttempts = job.max_attempts || MAX_ATTEMPTS;
  if (nextRetry >= maxAttempts) {
    await supabase
      .from("sync_jobs")
      .update({
        status: "dead_letter",
        attempts: job.attempts + 1,
        retry_count: nextRetry,
        last_error: error,
        failure_reason: error,
        finished_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
      })
      .eq("id", job.id);
    return;
  }
  const backoff = BACKOFF_SECONDS[Math.min(nextRetry - 1, BACKOFF_SECONDS.length - 1)];
  const next = new Date(Date.now() + backoff * 1000).toISOString();
  await supabase
    .from("sync_jobs")
    .update({
      status: "queued",
      attempts: job.attempts + 1,
      retry_count: nextRetry,
      last_error: error,
      failure_reason: error,
      next_attempt_at: next,
      scheduled_for: next,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", job.id);
}

// ---------------------------------------------------------------------------
// Job: moderate_comment
// ---------------------------------------------------------------------------

async function processModerateComment(
  supabase: SBClient,
  job: JobRow,
): Promise<{ ok: true; flagged: boolean } | { ok: false; error: string }> {
  const commentId = (job.payload?.comment_id as string) ?? job.related_comment_id;
  if (!commentId) return { ok: false, error: "missing comment_id" };

  const { data: comment, error: cErr } = await supabase
    .from("comments")
    .select("id, text, platform, author, user_id")
    .eq("id", commentId)
    .maybeSingle();
  if (cErr || !comment) return { ok: false, error: cErr?.message || "comment not found" };

  // Skip if analysis already exists (idempotent).
  const { data: existing } = await supabase
    .from("ai_analysis")
    .select("id")
    .eq("comment_id", commentId)
    .maybeSingle();
  if (existing) return { ok: true, flagged: false };

  const a = await analyzeWithDeepSeek(comment.text);
  if (!a) return { ok: false, error: "deepseek unavailable" };

  // 1) Persist ai_analysis (extended fields).
  const { error: aErr } = await supabase.from("ai_analysis").insert({
    user_id: job.user_id,
    comment_id: comment.id,
    sentiment: a.sentiment,
    toxicity_score: a.toxicity_score,
    harassment_score: a.harassment_score,
    spam_score: a.spam_score,
    confidence_score: a.confidence_score,
    recommendation: a.recommendation,
    scores: a.scores,
    emotions: a.emotions,
    risk_score: a.risk_score,
    priority: a.priority,
    reason: a.reason ?? null,
    explanation: a.reason ?? null,
    model: a.model,
    raw: a.raw as Record<string, unknown>,
  });
  if (aErr) return { ok: false, error: aErr.message };

  // 2) Update comment derived fields.
  const flagged = exceedsReviewThreshold(a);
  const commentPatch: Record<string, unknown> = {
    sentiment: a.sentiment,
    category: a.category,
    status: commentStatusFor(a),
  };
  if (flagged) commentPatch.review_status = "pending";
  await supabase.from("comments").update(commentPatch).eq("id", comment.id);

  // 3) Audit: analysis.completed
  await appendAudit(supabase, job.user_id, "analysis.completed", "comment", comment.id, {
    risk_score: a.risk_score,
    recommendation: a.recommendation,
    priority: a.priority,
    sentiment: a.sentiment,
    category: a.category,
  });

  // 4) review_queue + audit (when thresholds exceeded)
  if (flagged) {
    const { data: rq } = await supabase
      .from("review_queue")
      .upsert(
        {
          user_id: job.user_id,
          comment_id: comment.id,
          status: "pending",
          priority: reviewPriority(a),
          risk_score: a.risk_score,
          reason: a.reason ?? null,
          metadata: {
            recommendation: a.recommendation,
            scores: a.scores,
            emotions: a.emotions,
          },
        },
        { onConflict: "comment_id" },
      )
      .select("id")
      .maybeSingle();
    if (rq?.id) {
      await appendAudit(supabase, job.user_id, "review.created", "review_queue", rq.id, {
        comment_id: comment.id,
        priority: a.priority,
        risk_score: a.risk_score,
      });
    }
  }

  // 5) If recommendation forces an action (hide/flag), record a moderation_action + audit
  if (a.recommendation === "hide" || a.recommendation === "flag") {
    const action = a.recommendation === "hide" ? "hide" : "flag";
    const { data: ma } = await supabase
      .from("moderation_actions")
      .insert({
        user_id: job.user_id,
        comment_id: comment.id,
        action_type: action,
        reason: a.reason ?? null,
        previous_state: { status: "allowed" },
        new_state: { status: commentStatusFor(a) },
        metadata: { source: "ai", model: a.model, risk_score: a.risk_score },
      })
      .select("id")
      .maybeSingle();
    if (ma?.id) {
      await appendAudit(supabase, job.user_id, "moderation.action", "moderation_action", ma.id, {
        comment_id: comment.id,
        action_type: action,
        source: "ai",
      });
    }
  }

  // 6) Workflow rules engine — post-analysis automation.
  try {
    const { runWorkflows } = await import("../workflow/engine.server");
    await runWorkflows(supabase, job.user_id,
      { id: comment.id, platform: comment.platform, text: comment.text, author: comment.author }, a);
  } catch {
    // workflow errors must not break moderation
  }

  return { ok: true, flagged };
}

// ---------------------------------------------------------------------------
// Public drain entrypoint
// ---------------------------------------------------------------------------

export async function drainModerationJobs(
  supabase: SBClient,
  limit = BATCH_SIZE,
): Promise<{ claimed: number; ok: number; failed: number; deadLetter: number }> {
  const claimed = await claimJobs(supabase, limit);
  let ok = 0;
  let failed = 0;
  let deadLetter = 0;

  for (let i = 0; i < claimed.length; i += CONCURRENCY) {
    const slice = claimed.slice(i, i + CONCURRENCY);
    await Promise.all(
      slice.map(async (job) => {
        try {
          let res: Awaited<ReturnType<typeof processModerateComment>>;
          if (job.job_type === "moderate_comment") {
            res = await processModerateComment(supabase, job);
          } else {
            res = { ok: false, error: `unknown job_type ${job.job_type}` };
          }
          if (res.ok) {
            ok++;
            await finishOk(supabase, job.id, { flagged: res.flagged });
          } else {
            failed++;
            await appendAudit(supabase, job.user_id, "analysis.failed", "sync_job", job.id, {
              comment_id: job.related_comment_id,
              error: res.error,
              attempt: job.retry_count + 1,
            });
            await finishFail(supabase, job, res.error);
            if (job.retry_count + 1 >= (job.max_attempts || MAX_ATTEMPTS)) deadLetter++;
          }
        } catch (e) {
          failed++;
          const msg = e instanceof Error ? e.message : String(e);
          await appendAudit(supabase, job.user_id, "analysis.failed", "sync_job", job.id, {
            comment_id: job.related_comment_id,
            error: msg,
            attempt: job.retry_count + 1,
            unexpected: true,
          });
          await finishFail(supabase, job, msg);
          if (job.retry_count + 1 >= (job.max_attempts || MAX_ATTEMPTS)) deadLetter++;
        }
      }),
    );
  }

  return { claimed: claimed.length, ok, failed, deadLetter };
}
