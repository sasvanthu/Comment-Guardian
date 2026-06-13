/**
 * Moderation post-processor (server-only).
 * Called from the sync pipeline AFTER comments are upserted.
 * For every freshly inserted comment in the given (platform, external_id)
 * batch that doesn't yet have an ai_analysis row:
 *   1. Run DeepSeek
 *   2. Insert ai_analysis
 *   3. If thresholds are exceeded, set comment.review_status='pending'
 *      and update category/sentiment/status so the Review Queue, Cyberbullying,
 *      and Negative pages all reflect the AI verdict.
 *
 * Designed for both authenticated user supabase and supabaseAdmin clients.
 */
import { analyzeWithDeepSeek, exceedsReviewThreshold } from "./deepseek.server";
import type { DeepSeekAnalysis } from "./deepseek.server";

type SBClient = { from: (t: string) => any };

interface PendingComment {
  id: string;
  text: string;
  platform: string;
  author: string;
}

const CONCURRENCY = 3;

function commentStatusFor(a: DeepSeekAnalysis): "allowed" | "flagged" | "hidden" {
  if (a.recommendation === "hide") return "hidden";
  if (a.recommendation === "flag") return "flagged";
  return "allowed";
}

async function loadPending(
  supabase: SBClient,
  userId: string,
  platform: string,
  externalIds: string[],
): Promise<PendingComment[]> {
  if (!externalIds.length) return [];
  const { data, error } = await supabase
    .from("comments")
    .select("id, text, platform, author, ai_analysis!left(id)")
    .eq("user_id", userId)
    .eq("platform", platform)
    .in("external_id", externalIds);
  if (error || !data) return [];
  return (data as Array<{ id: string; text: string; platform: string; author: string; ai_analysis: Array<{ id: string }> | null }>)
    .filter((r) => !r.ai_analysis || r.ai_analysis.length === 0)
    .map((r) => ({ id: r.id, text: r.text, platform: r.platform, author: r.author }));
}

async function processOne(
  supabase: SBClient,
  userId: string,
  c: PendingComment,
): Promise<{ analyzed: boolean; flagged: boolean }> {
  const a = await analyzeWithDeepSeek(c.text);
  if (!a) return { analyzed: false, flagged: false };

  await supabase.from("ai_analysis").insert({
    user_id: userId,
    comment_id: c.id,
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
    model: a.model,
    raw: a.raw as Record<string, unknown>,
  });

  const flagged = exceedsReviewThreshold(a);
  const commentPatch: Record<string, unknown> = {
    sentiment: a.sentiment,
    category: a.category,
    status: commentStatusFor(a),
  };
  if (flagged) commentPatch.review_status = "pending";
  await supabase.from("comments").update(commentPatch).eq("id", c.id);

  // Workflow rules engine — post-analysis automation.
  try {
    const { runWorkflows } = await import("../workflow/engine.server");
    await runWorkflows(supabase, userId,
      { id: c.id, platform: c.platform, text: c.text, author: c.author }, a);
  } catch {
    // workflow errors must not break moderation
  }
  return { analyzed: true, flagged };
}

export async function moderateBatch(
  supabase: SBClient,
  userId: string,
  platform: string,
  externalIds: string[],
): Promise<{ analyzed: number; flagged: number }> {
  if (!process.env.DEEPSEEK_API_KEY) return { analyzed: 0, flagged: 0 };
  const pending = await loadPending(supabase, userId, platform, externalIds);
  if (!pending.length) return { analyzed: 0, flagged: 0 };

  let analyzed = 0;
  let flagged = 0;
  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const slice = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.all(slice.map((c) => processOne(supabase, userId, c)));
    for (const r of results) {
      if (r.analyzed) analyzed++;
      if (r.flagged) flagged++;
    }
  }
  return { analyzed, flagged };
}
