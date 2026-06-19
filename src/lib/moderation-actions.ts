/**
 * Unified moderation action workflow.
 *
 * Single entry point for every moderator decision (approve / hide / delete /
 * block / escalate). For each comment it:
 *
 *   1. Skips when the target state is already current (idempotent — same
 *      action cannot execute twice for the same review state).
 *   2. Updates the comment row (status + review_status).
 *   3. Upserts the review_queue row to the new status.
 *   4. Inserts a moderation_actions record (with optional moderator note).
 *   5. Inserts an audit_logs entry capturing previous + new state.
 *   6. Inserts an activity_logs entry so the live activity feed updates.
 *   7. For "escalate": creates a case + case_comments link.
 *   8. For "block":   adds the author to the blacklist.
 *
 * Bulk calls run inside a single Promise.all batch — all 10 records land
 * together so the dashboard / reports / audit log refresh in lockstep.
 * Failures roll back the optimistic UI by re-throwing to the caller.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { executePlatformActions } from "@/lib/platforms.functions";

export type ModeratorAction =
  | "approve"
  | "hide"
  | "delete"
  | "block"
  | "escalate";

type ReviewStatus = Database["public"]["Enums"]["review_queue_status"];
type CommentStatus = "allowed" | "hidden" | "deleted";
type DbActionType = Database["public"]["Enums"]["moderation_action_type"];

interface ActionPlan {
  reviewStatus: ReviewStatus;
  commentStatus: CommentStatus | null; // null = leave unchanged
  dbAction: DbActionType;
  auditAction: string;
  notifyTitle: string;
}

const PLAN: Record<ModeratorAction, ActionPlan> = {
  approve:  { reviewStatus: "approved",  commentStatus: "allowed", dbAction: "approve",   auditAction: "moderation.approve",  notifyTitle: "Comment approved" },
  hide:     { reviewStatus: "reviewed",  commentStatus: "hidden",  dbAction: "hide",      auditAction: "moderation.hide",     notifyTitle: "Comment hidden" },
  delete:   { reviewStatus: "resolved",  commentStatus: "deleted", dbAction: "delete",    auditAction: "moderation.delete",   notifyTitle: "Comment deleted" },
  block:    { reviewStatus: "reviewed",  commentStatus: "hidden",  dbAction: "blacklist", auditAction: "moderation.block",    notifyTitle: "User blocked" },
  escalate: { reviewStatus: "escalated", commentStatus: null,      dbAction: "escalate",  auditAction: "moderation.escalate", notifyTitle: "Comment escalated" },
};

export interface ModerationOptions {
  note?: string;
  caseTitle?: string;       // escalate only
  caseSeverity?: Database["public"]["Enums"]["review_priority"];
}

export interface ModerationResult {
  action: ModeratorAction;
  applied: string[];
  skipped: string[];        // already in target state
  failed: { id: string; error: string }[];
  caseId?: string;
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error("Not signed in");
  return data.user.id;
}


export async function runModerationAction(
  commentIds: string[],
  action: ModeratorAction,
  opts: ModerationOptions = {},
): Promise<ModerationResult> {
  const ids = Array.from(new Set(commentIds.filter(Boolean)));
  const result: ModerationResult = { action, applied: [], skipped: [], failed: [] };
  if (!ids.length) return result;

  const userId = await uid();
  const plan = PLAN[action];

  // 1) Snapshot current state for idempotency + audit "previous_state".
  const [{ data: comments, error: cErr }, { data: rqExisting }] = await Promise.all([
    supabase.from("comments")
      .select("id, status, review_status, author, platform, text, external_id")
      .in("id", ids),
    supabase.from("review_queue")
      .select("comment_id, status")
      .in("comment_id", ids),
  ]);
  if (cErr) throw cErr;

  const rqStatusByComment = new Map(
    (rqExisting ?? []).map((r) => [r.comment_id, r.status]),
  );
  const byId = new Map((comments ?? []).map((c) => [c.id, c]));
  const toApply: NonNullable<typeof comments> = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { result.failed.push({ id, error: "comment not found" }); continue; }
    const queueStatus = rqStatusByComment.get(id);
    const queueMatches = queueStatus === plan.reviewStatus;
    const commentMatches = !plan.commentStatus || row.status === plan.commentStatus;
    if (queueMatches && commentMatches) { result.skipped.push(id); continue; }
    toApply.push(row);
  }
  if (!toApply.length) return result;

  const applyIds = toApply.map((c) => c.id);

  // 2) Comment table — patch status + review_status in one update.
  // comments.review_status is a narrower enum than review_queue.status, so
  // map the wider queue terms ("assigned" / "resolved") onto the comment enum.
  const commentReviewStatus = (
    plan.reviewStatus === "resolved" ? "reviewed"
    : plan.reviewStatus === "assigned" ? "pending"
    : plan.reviewStatus
  ) as Database["public"]["Enums"]["review_status"];
  const commentPatch: Database["public"]["Tables"]["comments"]["Update"] = {
    review_status: commentReviewStatus,
  };
  if (plan.commentStatus) commentPatch.status = plan.commentStatus;
  const { error: upErr } = await supabase.from("comments").update(commentPatch).in("id", applyIds);
  if (upErr) throw upErr;

  // 3) review_queue upsert (one row per comment thanks to unique(comment_id)).
  const now = new Date().toISOString();
  const reviewRows = toApply.map((c) => ({
    user_id: userId,
    comment_id: c.id,
    status: plan.reviewStatus,
    reason: opts.note ?? null,
    resolved_at: plan.reviewStatus === "resolved" || plan.reviewStatus === "approved"
      ? now : null,
    metadata: { last_action: action, note: opts.note ?? null },
  }));
  const { data: rqRows } = await supabase
    .from("review_queue")
    .upsert(reviewRows, { onConflict: "comment_id" })
    .select("id, comment_id");
  const rqByComment = new Map((rqRows ?? []).map((r) => [r.comment_id, r.id]));

  // 4) Escalate → case + case_comments.
  let caseId: string | undefined;
  if (action === "escalate") {
    const first = toApply[0];
    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .insert({
        user_id: userId,
        title: opts.caseTitle?.trim()
          || `Escalation: ${first.author} (${first.platform})`
          + (toApply.length > 1 ? ` +${toApply.length - 1}` : ""),
        summary: opts.note ?? null,
        status: "investigating",
        severity: opts.caseSeverity ?? "high",
        subject_author: first.author,
        subject_platform: first.platform,
        metadata: { comment_ids: applyIds, source: "review_queue" },
      })
      .select("id")
      .single();
    if (caseErr) throw caseErr;
    caseId = caseRow.id;
    await supabase.from("case_comments").insert(
      applyIds.map((cid) => ({ case_id: caseRow.id, comment_id: cid, user_id: userId })),
    );
    result.caseId = caseId;
  }

  // 5) Block → blacklist authors (unique handles).
  if (action === "block") {
    const authors = Array.from(new Set(toApply.map((c) => c.author).filter(Boolean)));
    if (authors.length) {
      await supabase.from("blacklist").insert(
        authors.map((a) => ({ user_id: userId, type: "user_handle" as const, value: a })),
      );
    }
  }

  // 6) moderation_actions + audit_logs + activity_logs — written in parallel.
  const actionRows = toApply.map((c) => ({
    user_id: userId,
    actor_id: userId,
    comment_id: c.id,
    review_queue_id: rqByComment.get(c.id) ?? null,
    action: plan.dbAction,
    reason: opts.note ?? null,
    previous_state: { status: c.status, review_status: c.review_status },
    new_state: { status: plan.commentStatus ?? c.status, review_status: plan.reviewStatus },
    metadata: {
      source: "moderator_ui",
      bulk: toApply.length > 1,
      note: opts.note ?? null,
      case_id: caseId ?? null,
    },
  }));

  const auditRows = toApply.map((c) => ({
    user_id: userId,
    actor_id: userId,
    action: plan.auditAction,
    entity_type: "comment",
    entity_id: c.id,
    previous_state: { status: c.status, review_status: c.review_status },
    new_state: { status: plan.commentStatus ?? c.status, review_status: plan.reviewStatus },
    metadata: {
      source: "moderator_ui",
      bulk: toApply.length > 1,
      note: opts.note ?? null,
      case_id: caseId ?? null,
    },
  }));

  const activityRow = {
    user_id: userId,
    action: plan.dbAction,
    target: applyIds.length === 1 ? toApply[0].author : `${applyIds.length} comments`,
    details: {
      reason: opts.note ?? plan.auditAction,
      count: applyIds.length,
      commentIds: applyIds,
      platform: toApply[0]?.platform,
      case_id: caseId ?? null,
    } as never,
  };

  const [ma, al] = await Promise.all([
    supabase.from("moderation_actions").insert(actionRows),
    supabase.from("audit_logs").insert(auditRows),
    supabase.from("activity_logs").insert(activityRow),
  ]);
  if (ma.error) throw ma.error;
  if (al.error) throw al.error;

  // 7) Dispatch external platform actions (delete, hide, approve, block).
  // The backend will catch these and use the right service (e.g. youtubeService.deleteComment).
  const extActions = toApply
    .filter((c) => c.external_id && c.platform)
    .map((c) => ({
      platform: c.platform,
      externalId: c.external_id!,
      action: action,
    }));

  if (extActions.length > 0) {
    try {
      await executePlatformActions({ actions: extActions });
    } catch (err) {
      console.error("Failed to execute platform actions:", err);
    }
  }

  result.applied = applyIds;
  return result;
}
