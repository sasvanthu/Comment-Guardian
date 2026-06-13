/**
 * Workflow rules engine (server-only).
 * Evaluates user-authored rules against an AI analysis + comment,
 * performs the configured actions, and records each execution.
 *
 * Conditions: { all?: Condition[], any?: Condition[] }
 * Condition: { field: string, op: Op, value: unknown }
 *   field examples:
 *     "risk_score", "priority", "recommendation", "sentiment", "category",
 *     "scores.toxicity", "scores.threats", "emotions.anger",
 *     "platform", "text"
 *
 * Actions:
 *   { type: "hide" }                          -> comments.status='hidden'
 *   { type: "flag" }                          -> status='flagged' + review_status='pending'
 *   { type: "review" }                        -> review_status='pending'
 *   { type: "set_status", params:{value} }    -> status=value
 *   { type: "set_category", params:{value} }  -> category=value
 *   { type: "log",  params:{ message } }      -> activity_logs row
 *   { type: "notify", params:{ message } }    -> activity_logs row tagged notify
 */
import type { DeepSeekAnalysis } from "../ai/deepseek.server";

type SBClient = { from: (t: string) => any };
type Op = "gte" | "lte" | "gt" | "lt" | "eq" | "neq" | "in" | "contains";

interface Condition { field: string; op: Op; value: unknown }
interface ConditionGroup { all?: Condition[]; any?: Condition[] }
interface Action { type: string; params?: Record<string, unknown> }
interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: ConditionGroup;
  actions: Action[];
}

interface CommentRow {
  id: string;
  platform: string;
  text: string;
  author: string;
}

function getField(path: string, ctx: { analysis: DeepSeekAnalysis; comment: CommentRow }): unknown {
  const a = ctx.analysis as unknown as Record<string, unknown>;
  // dotted lookups
  if (path.startsWith("scores.")) return (ctx.analysis.scores as Record<string, number>)[path.slice(7)];
  if (path.startsWith("emotions.")) return (ctx.analysis.emotions as Record<string, number>)[path.slice(9)];
  if (path === "platform") return ctx.comment.platform;
  if (path === "text") return ctx.comment.text;
  if (path === "author") return ctx.comment.author;
  return a[path];
}

function evalCondition(c: Condition, ctx: { analysis: DeepSeekAnalysis; comment: CommentRow }): boolean {
  const v = getField(c.field, ctx);
  const target = c.value;
  switch (c.op) {
    case "gte": return typeof v === "number" && typeof target === "number" && v >= target;
    case "lte": return typeof v === "number" && typeof target === "number" && v <= target;
    case "gt":  return typeof v === "number" && typeof target === "number" && v >  target;
    case "lt":  return typeof v === "number" && typeof target === "number" && v <  target;
    case "eq":  return v === target;
    case "neq": return v !== target;
    case "in":  return Array.isArray(target) && (target as unknown[]).includes(v);
    case "contains":
      return typeof v === "string" && typeof target === "string"
        && v.toLowerCase().includes(target.toLowerCase());
    default: return false;
  }
}

function matches(rule: Rule, ctx: { analysis: DeepSeekAnalysis; comment: CommentRow }): boolean {
  const all = rule.conditions?.all ?? [];
  const any = rule.conditions?.any ?? [];
  const allOk = all.length === 0 || all.every((c) => evalCondition(c, ctx));
  const anyOk = any.length === 0 || any.some((c) => evalCondition(c, ctx));
  return allOk && anyOk;
}

async function applyActions(
  supabase: SBClient,
  userId: string,
  comment: CommentRow,
  rule: Rule,
): Promise<{ taken: Action[]; error?: string }> {
  const patch: Record<string, unknown> = {};
  const taken: Action[] = [];
  const logs: Array<{ kind: string; message: string }> = [];

  for (const a of rule.actions ?? []) {
    switch (a.type) {
      case "hide":
        patch.status = "hidden";
        taken.push(a);
        break;
      case "flag":
        patch.status = "flagged";
        patch.review_status = "pending";
        taken.push(a);
        break;
      case "review":
        patch.review_status = "pending";
        taken.push(a);
        break;
      case "set_status":
        if (typeof a.params?.value === "string") { patch.status = a.params.value; taken.push(a); }
        break;
      case "set_category":
        if (typeof a.params?.value === "string") { patch.category = a.params.value; taken.push(a); }
        break;
      case "log":
        logs.push({ kind: "workflow_log", message: String(a.params?.message ?? rule.name) });
        taken.push(a);
        break;
      case "notify":
        logs.push({ kind: "workflow_notify", message: String(a.params?.message ?? rule.name) });
        taken.push(a);
        break;
    }
  }

  try {
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("comments").update(patch).eq("id", comment.id);
      if (error) return { taken, error: (error as { message?: string }).message ?? String(error) };
    }
    for (const l of logs) {
      await supabase.from("activity_logs").insert({
        user_id: userId,
        action: l.kind,
        target: comment.id,
        details: { rule_id: rule.id, rule_name: rule.name, message: l.message },
      });
    }
  } catch (e) {
    return { taken, error: (e as Error).message };
  }
  return { taken };
}

export async function runWorkflows(
  supabase: SBClient,
  userId: string,
  comment: CommentRow,
  analysis: DeepSeekAnalysis,
): Promise<number> {
  const { data: rules } = await supabase
    .from("workflow_rules")
    .select("id,name,enabled,priority,conditions,actions")
    .eq("user_id", userId)
    .eq("enabled", true)
    .order("priority", { ascending: true });
  if (!rules || !Array.isArray(rules) || rules.length === 0) return 0;

  let fired = 0;
  const ctx = { analysis, comment };
  for (const r of rules as Rule[]) {
    if (!matches(r, ctx)) continue;
    const result = await applyActions(supabase, userId, comment, r);
    await supabase.from("workflow_executions").insert({
      user_id: userId,
      rule_id: r.id,
      comment_id: comment.id,
      status: result.error ? "error" : "success",
      actions_taken: result.taken,
      error: result.error ?? null,
    });
    await supabase.from("workflow_rules")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", r.id);
    fired++;
  }
  return fired;
}
