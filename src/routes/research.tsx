import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Sparkles, Loader2, Quote, ShieldAlert, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { PlatformBadge } from "@/components/PlatformBadge";
import { EmptyState } from "@/components/EmptyState";
import type { Comment } from "@/lib/mock-data";
import { researchUser } from "@/lib/ai-research.functions";
import { useComments, saveResearch } from "@/lib/data";


export const Route = createFileRoute("/research")({
  head: () => ({
    meta: [
      { title: "AI Research — ModGuard" },
      { name: "description", content: "Use AI to research users, surface behavioral patterns, risk scores, and recommended moderator actions across their full comment history." },
      { property: "og:title", content: "AI Research — ModGuard" },
      { property: "og:description", content: "AI-powered user behavior research, risk scoring, and moderator recommendations." },
      { property: "og:url", content: "/research" },
    ],
    links: [{ rel: "canonical", href: "/research" }],
  }),
  component: ResearchPage,
});

type ResearchResult = Awaited<ReturnType<typeof researchUser>>;

const riskTone: Record<ResearchResult["riskLevel"], string> = {
  Low: "border-positive/30 bg-positive/10 text-positive",
  Medium: "border-neutral-warn/30 bg-neutral-warn/10 text-neutral-warn",
  High: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  Critical: "border-red-600/50 bg-red-600/15 text-red-300",
};

function ResearchPage() {
  const run = useServerFn(researchUser);
  const { comments } = useComments();

  const [query, setQuery] = useState("");
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResearchResult | null>(null);

  const authors = useMemo(() => {
    const map = new Map<string, { author: string; authorId: string; platform: Comment["platform"]; count: number; avgTox: number; latest: string }>();
    for (const c of comments) {
      const cur = map.get(c.authorId);
      if (cur) {
        cur.count += 1;
        cur.avgTox = (cur.avgTox * (cur.count - 1) + c.toxicityScore) / cur.count;
        if (c.timestamp > cur.latest) cur.latest = c.timestamp;
      } else {
        map.set(c.authorId, {
          author: c.author, authorId: c.authorId, platform: c.platform,
          count: 1, avgTox: c.toxicityScore, latest: c.timestamp,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.avgTox - a.avgTox);
  }, [comments]);

  const filtered = authors.filter((a) =>
    !query.trim() || a.author.toLowerCase().includes(query.toLowerCase()),
  );

  const research = async (authorId: string) => {
    const userComments = comments.filter((c) => c.authorId === authorId);
    if (userComments.length === 0) return;
    setSelectedAuthor(authorId);
    setLoading(true);
    setResult(null);
    try {
      const res = await run({
        data: {
          author: userComments[0].author,
          platform: userComments[0].platform,
          comments: userComments.slice(0, 30).map((c) => ({
            text: c.text,
            timestamp: c.timestamp,
            toxicity: c.toxicityScore,
          })),
        },
      });
      setResult(res);
      void saveResearch(`User: ${userComments[0].author}`, res);
      toast.success(`Research complete · ${res.riskLevel} risk`);

    } catch (err) {
      const msg = err instanceof Response ? await err.text() : (err as Error)?.message || "Research failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const selected = authors.find((a) => a.authorId === selectedAuthor);

  return (
    <Layout>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <Brain className="h-7 w-7 text-primary" /> AI Research
        </h1>
        <p className="text-sm text-muted-foreground">
          Profile any user with AI — patterns, risk score, evidence, and recommended action.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[360px,1fr]">
        {/* User list */}
        <aside className="rounded-xl border bg-card">
          <div className="border-b p-3">
            <div className="relative">
              <UserSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search authors…"
                aria-label="Search authors"
                className="w-full rounded-md border bg-input py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <ul className="max-h-[70vh] divide-y overflow-y-auto">
            {filtered.map((a) => {
              const active = a.authorId === selectedAuthor;
              return (
                <li key={a.authorId}>
                  <button
                    onClick={() => research(a.authorId)}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                      active ? "bg-primary/10" : "hover:bg-accent"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.author}</p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <PlatformBadge platform={a.platform} />
                        <span>{a.count} comments</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      a.avgTox >= 70 ? "bg-toxic/15 text-toxic" :
                      a.avgTox >= 40 ? "bg-neutral-warn/15 text-neutral-warn" :
                      "bg-positive/15 text-positive"
                    }`}>
                      {Math.round(a.avgTox)}%
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="p-6">
                <EmptyState icon={UserSearch} title={comments.length === 0 ? "No users yet" : "No authors match"} description={comments.length === 0 ? "Ingest comments first to research their authors." : undefined} />
              </li>
            )}

          </ul>
        </aside>

        {/* Result */}
        <section className="rounded-xl border bg-card p-6">
          {!selectedAuthor && (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center">
              <Sparkles className="mb-3 h-10 w-10 text-primary" />
              <p className="text-base font-medium">Select a user to research</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                AI will analyze the user's full comment history, surface patterns, and recommend an action.
              </p>
            </div>
          )}

          {selectedAuthor && (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{selected?.author}</h2>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {selected && <PlatformBadge platform={selected.platform} />}
                    <span>{selected?.count} comments analyzed</span>
                  </div>
                </div>
                <button
                  onClick={() => selectedAuthor && research(selectedAuthor)}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60 hover:opacity-90"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {loading ? "Researching…" : "Re-run"}
                </button>
              </div>

              {loading && !result && (
                <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  AI is profiling this user with Gemini 3.1 Pro…
                </div>
              )}

              {result && (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className={`rounded-lg border px-4 py-3 ${riskTone[result.riskLevel]}`}>
                      <p className="text-[11px] uppercase tracking-wide opacity-80">Risk level</p>
                      <p className="mt-1 text-2xl font-bold">{result.riskLevel}</p>
                      <p className="text-xs opacity-80">{result.riskScore}% risk score</p>
                    </div>
                    <div className="rounded-lg border bg-secondary/40 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Profile</p>
                      <p className="mt-1 text-base font-semibold">{result.profileType}</p>
                      <p className="text-xs text-muted-foreground">{result.confidence}% confidence</p>
                    </div>
                    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-wide text-primary/80">Recommendation</p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-base font-semibold text-primary">
                        <ShieldAlert className="h-4 w-4" /> {result.recommendedAction}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border p-4">
                    <h3 className="text-sm font-semibold">Summary</h3>
                    <p className="mt-1 text-sm leading-relaxed text-foreground/90">{result.summary}</p>
                  </div>

                  {result.patterns.length > 0 && (
                    <div className="rounded-lg border p-4">
                      <h3 className="text-sm font-semibold">Behavioral patterns</h3>
                      <ul className="mt-2 space-y-1 text-sm">
                        {result.patterns.map((p, i) => (
                          <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{p}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.topCategories.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Top categories</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {result.topCategories.map((c, i) => (
                          <span key={i} className="rounded-full border bg-secondary/40 px-2.5 py-1 text-xs font-medium">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.evidence.length > 0 && (
                    <div className="rounded-lg border p-4">
                      <h3 className="mb-2 text-sm font-semibold">Evidence</h3>
                      <div className="space-y-3">
                        {result.evidence.map((e, i) => (
                          <div key={i} className="border-l-2 border-primary/50 pl-3">
                            <p className="flex items-start gap-1.5 text-sm italic text-foreground/90">
                              <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <span>"{e.quote}"</span>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{e.why}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </Layout>
  );
}
