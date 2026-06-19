import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Trash2, Sparkles, ExternalLink, Languages, ShieldAlert, Ban, Loader2, Brain, ShieldCheck, MessageSquareReply, EyeOff, Eye, ShieldBan, Send, X } from "lucide-react";

import type { Comment, Category, Decision } from "@/lib/types";
import { PlatformBadge } from "./PlatformBadge";
import { SentimentBadge } from "./SentimentBadge";
import { translateText } from "@/lib/translate.functions";
import { analyzeToxic } from "@/lib/ai-research.functions";
import { detectSpamScam } from "@/lib/spam-detect.functions";
import { loadPrefs } from "@/lib/storage";
import { toast } from "sonner";
import {
  replyToYoutubeComment,
  moderateYoutubeComment,
  banYoutubeUser,
  markYoutubeCommentAsSpam,
  approveYoutubeComment,
} from "@/lib/integrations/youtube";

type AnalyzeResult = Awaited<ReturnType<typeof analyzeToxic>>;
type SpamResult = Awaited<ReturnType<typeof detectSpamScam>>["results"][number];

const bgTint: Record<Comment["sentiment"], string> = {
  toxic: "bg-toxic/5 border-toxic/20",
  positive: "bg-positive/5 border-positive/20",
  neutral: "bg-card border-border",
};

const categoryColor: Record<Category, string> = {
  safe: "bg-positive/15 text-positive border-positive/30",
  toxic: "bg-toxic/15 text-toxic border-toxic/30",
  hate: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  harassment: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  cyberbullying: "bg-red-500/15 text-red-400 border-red-500/30",
  threats: "bg-red-600/20 text-red-300 border-red-600/40",
  spam: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  scam: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  sexual: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  misinformation: "bg-purple-500/15 text-purple-300 border-purple-500/30",
};

const decisionColor: Record<Decision, string> = {
  allow: "bg-positive/15 text-positive border-positive/30",
  review: "bg-neutral-warn/15 text-neutral-warn border-neutral-warn/30",
  delete: "bg-toxic/15 text-toxic border-toxic/30",
  block: "bg-red-600/20 text-red-300 border-red-600/40",
};

export function CommentCard({
  c, selected, onSelectChange, onDelete, onBlock,
}: { c: Comment; selected: boolean; onSelectChange: (v: boolean) => void; onDelete: () => void; onBlock?: () => void }) {
  const translate = translateText;
  const analyze = analyzeToxic;
  const spamCheck = detectSpamScam;
  const [showTranslation, setShowTranslation] = useState(false);
  const [liveTranslation, setLiveTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [aiResult, setAiResult] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [spamResult, setSpamResult] = useState<SpamResult | null>(null);
  const [scanningSpam, setScanningSpam] = useState(false);
  // YouTube-specific state
  const isYoutube = c.platform === "youtube";
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replying, setReplying] = useState(false);
  const [ytActing, setYtActing] = useState<string | null>(null);
  const initials = c.author.split(" ").map((s) => s[0]).slice(0, 2).join("");
  const barColor = c.toxicityScore >= 70 ? "bg-toxic" : c.toxicityScore >= 40 ? "bg-neutral-warn" : "bg-positive";
  const sentBar = c.sentimentScore >= 60 ? "bg-positive" : c.sentimentScore >= 35 ? "bg-neutral-warn" : "bg-toxic";
  const shownTranslation = liveTranslation ?? c.translation;
  const showTr = showTranslation && shownTranslation && shownTranslation !== c.text;

  const toggleTranslation = async () => {
    if (showTranslation) { setShowTranslation(false); return; }
    if (liveTranslation || (c.translation && c.translation !== c.text)) {
      setShowTranslation(true);
      return;
    }
    setTranslating(true);
    try {
      const target = loadPrefs().defaultTargetLanguage;
      const out = await translate({ data: { text: c.text, target } });
      setLiveTranslation(out.translation);
      setShowTranslation(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setTranslating(false);
    }
  };

  const runAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await analyze({ data: { text: c.text, author: c.author, language: c.languageName } });
      setAiResult(res);
      toast.success(`AI: ${res.severity} severity · ${res.recommendedAction}`);
    } catch (e) {
      const msg = e instanceof Response ? await e.text() : e instanceof Error ? e.message : "Analyze failed";
      toast.error(msg);
    } finally {
      setAnalyzing(false);
    }
  };


  const runSpamCheck = async () => {
    setScanningSpam(true);
    try {
      const res = await spamCheck({ data: { items: [{ id: c.id, text: c.text }] } });
      const r = res.results[0] ?? null;
      setSpamResult(r);
      if (r) toast.success(`Spam check: ${r.label} (${r.confidence}%)`);
    } catch (e) {
      const msg = e instanceof Response ? await e.text() : e instanceof Error ? e.message : "Spam check failed";
      toast.error(msg);
    } finally {
      setScanningSpam(false);
    }
  };


  return (
    <div className={`rounded-xl border p-4 transition hover:border-primary/40 ${bgTint[c.sentiment]}`}>
      <div className="flex gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelectChange(e.target.checked)}
          aria-label={`Select comment from ${c.author}`}
          className="mt-1 h-4 w-4 accent-primary"
        />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-sm font-bold text-primary-foreground">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.author}</span>
            <PlatformBadge platform={c.platform} />
            <SentimentBadge sentiment={c.sentiment} />
            <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              <Languages className="h-3 w-3" /> {c.languageName}
            </span>
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${decisionColor[c.decision]}`}>
              {c.decision}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(c.timestamp), { addSuffix: true })}
            </span>
          </div>

          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{c.text}</p>
          {showTr && (
            <p className="mt-1 rounded-md border border-primary/20 bg-primary/5 p-2 text-sm italic text-foreground/80">
              <span className="mr-1 font-semibold text-primary">EN:</span>{shownTranslation}
            </p>
          )}
          <button
            onClick={toggleTranslation}
            disabled={translating}
            className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60"
          >
            {translating && <Loader2 className="h-3 w-3 animate-spin" />}
            {translating ? "Translating…" : showTranslation ? "Hide translation" : "Show English translation"}
          </button>

          {c.categories.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {c.categories.map((cat) => (
                <span key={cat} className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${categoryColor[cat]}`}>
                  {cat}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Meter label="Toxicity" value={c.toxicityScore} barClass={barColor} />
            <Meter label="Sentiment" value={c.sentimentScore} barClass={sentBar} />
            <Meter label="Confidence" value={c.confidence} barClass="bg-primary" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={runAnalyze}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-60"
            >
              {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {analyzing ? "Analyzing…" : "AI Analyze"}
            </button>
            <button
              onClick={runSpamCheck}
              disabled={scanningSpam}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-60"
            >
              {scanningSpam ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {scanningSpam ? "Scanning…" : "Spam check"}
            </button>
            <a
              href={`/research`}
              className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
              title={`Research ${c.author}`}
            >
              <Brain className="h-3.5 w-3.5" /> Research user
            </a>
            <button
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-md border border-toxic/40 bg-toxic/10 px-2.5 py-1 text-xs font-medium text-toxic hover:bg-toxic/20"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            {onBlock && (
              <button
                onClick={onBlock}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20"
              >
                <Ban className="h-3.5 w-3.5" /> Block user
              </button>
            )}
            <button
              onClick={() => toast("Opening original post")}
              className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View
            </button>
            {c.decision === "block" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-400">
                <ShieldAlert className="h-3 w-3" /> Auto-block recommended
              </span>
            )}
          </div>

          {/* ─── YouTube-Specific Actions ─────────────────────────── */}
          {isYoutube && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                onClick={() => setShowReply(!showReply)}
                className="inline-flex items-center gap-1 rounded-md border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-[11px] font-medium text-sky-400 hover:bg-sky-500/20"
              >
                <MessageSquareReply className="h-3 w-3" /> Reply
              </button>
              <button
                onClick={async () => {
                  setYtActing("hide");
                  try {
                    await moderateYoutubeComment(c.id, "rejected");
                    toast.success("Comment hidden on YouTube");
                  } catch (e) { toast.error((e as Error).message); }
                  finally { setYtActing(null); }
                }}
                disabled={ytActing === "hide"}
                className="inline-flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-400 hover:bg-orange-500/20 disabled:opacity-50"
              >
                {ytActing === "hide" ? <Loader2 className="h-3 w-3 animate-spin" /> : <EyeOff className="h-3 w-3" />}
                Hide
              </button>
              <button
                onClick={async () => {
                  setYtActing("publish");
                  try {
                    await approveYoutubeComment(c.id);
                    toast.success("Comment published on YouTube");
                  } catch (e) { toast.error((e as Error).message); }
                  finally { setYtActing(null); }
                }}
                disabled={ytActing === "publish"}
                className="inline-flex items-center gap-1 rounded-md border border-positive/40 bg-positive/10 px-2 py-1 text-[11px] font-medium text-positive hover:bg-positive/20 disabled:opacity-50"
              >
                {ytActing === "publish" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                Publish
              </button>
              <button
                onClick={async () => {
                  setYtActing("spam");
                  try {
                    await markYoutubeCommentAsSpam(c.id);
                    toast.success("Marked as spam on YouTube");
                  } catch (e) { toast.error((e as Error).message); }
                  finally { setYtActing(null); }
                }}
                disabled={ytActing === "spam"}
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/20 disabled:opacity-50"
              >
                {ytActing === "spam" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldBan className="h-3 w-3" />}
                Spam
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Ban this user from your YouTube channel? This cannot be undone.")) return;
                  setYtActing("ban");
                  try {
                    await banYoutubeUser(c.id);
                    toast.success("User banned from your YouTube channel");
                  } catch (e) { toast.error((e as Error).message); }
                  finally { setYtActing(null); }
                }}
                disabled={ytActing === "ban"}
                className="inline-flex items-center gap-1 rounded-md border border-red-600/40 bg-red-600/10 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-600/20 disabled:opacity-50"
              >
                {ytActing === "ban" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                Ban on YT
              </button>
            </div>
          )}

          {/* ─── Reply Input ──────────────────────────────────────── */}
          {isYoutube && showReply && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply…"
                className="flex-1 rounded-md border bg-input px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && replyText.trim()) {
                    e.preventDefault();
                    (async () => {
                      setReplying(true);
                      try {
                        await replyToYoutubeComment(c.id, replyText.trim());
                        toast.success("Reply posted on YouTube!");
                        setReplyText("");
                        setShowReply(false);
                      } catch (err) { toast.error((err as Error).message); }
                      finally { setReplying(false); }
                    })();
                  }
                }}
              />
              <button
                onClick={async () => {
                  if (!replyText.trim()) return;
                  setReplying(true);
                  try {
                    await replyToYoutubeComment(c.id, replyText.trim());
                    toast.success("Reply posted on YouTube!");
                    setReplyText("");
                    setShowReply(false);
                  } catch (err) { toast.error((err as Error).message); }
                  finally { setReplying(false); }
                }}
                disabled={replying || !replyText.trim()}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {replying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </button>
              <button
                onClick={() => { setShowReply(false); setReplyText(""); }}
                className="inline-flex items-center rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {aiResult && (
            <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" /> AI verdict
                </span>
                <span className="rounded-md bg-toxic/15 px-2 py-0.5 font-semibold text-toxic">{aiResult.severity}</span>
                <span className="text-muted-foreground">Tox {aiResult.toxicity}% · Bully {aiResult.cyberbullyingProbability}% · Conf {aiResult.confidence}%</span>
                <span className="ml-auto rounded-md border border-primary/40 px-2 py-0.5 font-semibold text-primary">{aiResult.recommendedAction}</span>
              </div>
              <p className="mt-2 text-sm">{aiResult.reason}</p>
              {aiResult.signals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {aiResult.signals.map((s: string, i: number) => (
                    <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{s}</span>
                  ))}
                </div>
              )}
              {aiResult.categories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {aiResult.categories.map((cat: string, i: number) => (
                    <span key={i} className="rounded-md border bg-secondary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">{cat}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {spamResult && (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                  <ShieldCheck className="h-3.5 w-3.5" /> Spam/Scam check
                </span>
                <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-semibold uppercase tracking-wide text-amber-300">
                  {spamResult.label}
                </span>
                <span className="text-muted-foreground">Confidence {spamResult.confidence}%</span>
              </div>
              <p className="mt-2 text-sm">{spamResult.reason}</p>
              {spamResult.signals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {spamResult.signals.map((s: string, i: number) => (
                    <span key={i} className="rounded-full bg-amber-500/10 px-2 py-0.5 font-medium text-amber-300">{s}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meter({ label, value, barClass }: { label: string; value: number; barClass: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold text-foreground">{value}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
