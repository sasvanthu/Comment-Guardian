/**
 * Central data layer wiring the portal to Supabase.
 * All reads are RLS-scoped to the authenticated user (admins see all rows).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Comment, BlockedUser, ModerationLog, Category, Platform, Sentiment } from "@/lib/types";

export type DbComment = Database["public"]["Tables"]["comments"]["Row"];
export type DbBlacklist = Database["public"]["Tables"]["blacklist"]["Row"];
export type DbLog = Database["public"]["Tables"]["activity_logs"]["Row"];
export type DbResearch = Database["public"]["Tables"]["research_queries"]["Row"];
export type DbFeedback = Database["public"]["Tables"]["moderator_feedback"]["Row"];
export type ReviewStatus = Database["public"]["Enums"]["review_status"];
export type FeedbackType = Database["public"]["Enums"]["feedback_type"];

const KNOWN_CATEGORIES = new Set<Category>([
  "safe","toxic","hate","harassment","cyberbullying","threats","spam","scam","sexual","misinformation",
]);

const toxicityFor = (cat: string): number =>
  cat === "toxic" || cat === "cyberbullying" ? 85 : cat === "spam" ? 55 : cat === "positive" ? 5 : 25;

export function rowToComment(row: DbComment): Comment {
  const sentiment: Sentiment = row.sentiment === "negative" ? "toxic" : row.sentiment === "positive" ? "positive" : "neutral";
  const cat = (KNOWN_CATEGORIES.has(row.category as Category) ? row.category : "safe") as Category;
  const toxicity = toxicityFor(row.category);
  return {
    id: row.id,
    platform: row.platform as Platform,
    author: row.author,
    authorId: row.author,
    text: row.text,
    sentiment,
    toxicity,
    toxicityScore: toxicity,
    sentimentScore: sentiment === "positive" ? 85 : sentiment === "toxic" ? 15 : 50,
    confidence: 80,
    language: (row.language ?? "en").slice(0, 5),
    languageName: row.language ?? "English",
    translation: row.text,
    categories: [cat],
    decision: row.status === "deleted" ? "delete" : row.status === "hidden" ? "review" : "allow",
    timestamp: row.created_at,
  };
}

export function rowToBlocked(row: DbBlacklist): BlockedUser {
  return {
    userId: row.id,
    username: row.value,
    platform: "twitter" as Platform,
    reason: row.type === "keyword" ? `Blocked keyword "${row.value}"` : `Blocked handle ${row.value}`,
    categories: ["toxic"],
    ip: null,
    timestamp: row.created_at,
  };
}

export function rowToLog(row: DbLog): ModerationLog {
  const action = (["delete","block","restore","allow","hide","unblock"].includes(row.action) ? row.action : "allow") as ModerationLog["action"];
  return {
    id: row.id,
    action,
    platform: ((row.details as { platform?: string } | null)?.platform ?? "twitter") as Platform,
    reason: (row.details as { reason?: string } | null)?.reason ?? row.target ?? row.action,
    timestamp: row.created_at,
  };
}

/* -------------------- Mutations -------------------- */

async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function logAction(action: string, target?: string, details?: Record<string, unknown>) {
  const uid = await getUid();
  if (!uid) return;
  await supabase.from("activity_logs").insert({ user_id: uid, action, target: target ?? null, details: (details ?? null) as never });
}

export async function insertComment(input: {
  platform: Platform; author: string; text: string;
  sentiment?: "positive"|"neutral"|"negative"; category?: string;
}) {
  const uid = await getUid();
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await supabase.from("comments").insert({
    user_id: uid,
    platform: input.platform,
    author: input.author,
    text: input.text,
    sentiment: input.sentiment ?? "neutral",
    category: (input.category ?? "neutral") as Database["public"]["Enums"]["comment_category"],
  }).select().single();
  if (error) throw error;
  await logAction("ingest", input.author, { platform: input.platform, reason: "manual ingest" });
  return data;
}

export async function deleteCommentsByIds(ids: string[]) {
  if (!ids.length) return;
  // Soft-delete (status='deleted')
  const { error } = await supabase.from("comments").update({ status: "deleted" }).in("id", ids);
  if (error) throw error;
  await logAction("delete", `${ids.length} comments`, { reason: "moderator action", count: ids.length });
}

export async function hardDeleteCommentsByIds(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("comments").delete().in("id", ids);
  if (error) throw error;
  await logAction("delete", `${ids.length} comments removed`, { reason: "hard delete", count: ids.length });
}

export async function setCommentsStatus(ids: string[], status: "allowed" | "hidden" | "deleted") {
  if (!ids.length) return;
  const { error } = await supabase.from("comments").update({ status }).in("id", ids);
  if (error) throw error;
  const action = status === "deleted" ? "delete" : status === "hidden" ? "hide" : "restore";
  await logAction(action, `${ids.length} comments`, { reason: `status:${status}`, count: ids.length, commentIds: ids });
}

export async function addBlacklist(type: "keyword"|"user_handle", value: string) {
  const uid = await getUid();
  if (!uid) throw new Error("Not signed in");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Value required");
  const { data, error } = await supabase.from("blacklist").insert({ user_id: uid, type, value: trimmed }).select().single();
  if (error) throw error;
  await logAction("block", trimmed, { reason: `blacklist:${type}` });
  return data;
}

export async function removeBlacklist(id: string) {
  const { data: row } = await supabase.from("blacklist").select("type,value").eq("id", id).maybeSingle();
  const { error } = await supabase.from("blacklist").delete().eq("id", id);
  if (error) throw error;
  await logAction("unblock", row?.value ?? id, { reason: `unblacklist:${row?.type ?? "unknown"}` });
}

export async function saveResearch(text: string, results: unknown) {
  const uid = await getUid();
  if (!uid) return;
  await supabase.from("research_queries").insert({
    user_id: uid, text, analysis_results: results as Database["public"]["Tables"]["research_queries"]["Insert"]["analysis_results"],
  });
}

/* -------------------- Hooks -------------------- */

export function useComments() {
  const [rows, setRows] = useState<DbComment[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("comments").select("*").order("created_at", { ascending: false }).limit(500);
    setRows(data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const ch = supabase.channel(`comments-feed-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, () => { void reload(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [reload]);
  const comments = useMemo(() => rows.filter((r) => r.status !== "deleted").map(rowToComment), [rows]);
  const allComments = useMemo(() => rows.map(rowToComment), [rows]);
  return { rows, comments, allComments, loading, reload, setRows };
}

export function useBlacklist() {
  const [rows, setRows] = useState<DbBlacklist[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("blacklist").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const ch = supabase.channel(`blacklist-feed-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blacklist" }, () => { void reload(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [reload]);
  return { rows, loading, reload };
}

export function useActivityLogs(limit = 30) {
  const [logs, setLogs] = useState<ModerationLog[]>([]);
  const limitRef = useRef(limit);
  limitRef.current = limit;
  const reload = useCallback(async () => {
    const { data } = await supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(limitRef.current);
    setLogs((data ?? []).map(rowToLog));
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const ch = supabase.channel(`logs-feed-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, (payload) => {
        const row = payload.new as DbLog;
        setLogs((prev) => [rowToLog(row), ...prev].slice(0, limitRef.current));
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);
  return { logs, reload };
}

export function useResearchHistory() {
  const [rows, setRows] = useState<DbResearch[]>([]);
  const reload = useCallback(async () => {
    const { data } = await supabase.from("research_queries").select("*").order("created_at", { ascending: false }).limit(50);
    setRows(data ?? []);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { rows, reload };
}

/* -------------------- Review queue -------------------- */

export async function setReviewStatus(ids: string[], status: ReviewStatus) {
  if (!ids.length) return;
  const { error } = await supabase.from("comments").update({ review_status: status }).in("id", ids);
  if (error) throw error;
  await logAction("allow", `${ids.length} comments`, { reason: `review:${status}`, count: ids.length, commentIds: ids });
}

export async function addFeedback(commentId: string, feedback: FeedbackType, notes?: string) {
  const uid = await getUid();
  if (!uid) throw new Error("Not signed in");
  const { error } = await supabase.from("moderator_feedback").insert({
    user_id: uid, comment_id: commentId, feedback, notes: notes ?? null,
  });
  if (error) throw error;
  await logAction("allow", commentId, { reason: `feedback:${feedback}` });
}

export function useModeratorFeedback() {
  const [rows, setRows] = useState<DbFeedback[]>([]);
  const reload = useCallback(async () => {
    const { data } = await supabase.from("moderator_feedback").select("*").order("created_at", { ascending: false }).limit(500);
    setRows(data ?? []);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const ch = supabase.channel("feedback-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "moderator_feedback" }, () => { void reload(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [reload]);
  return { rows, reload };
}

