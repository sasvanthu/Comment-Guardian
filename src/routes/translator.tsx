

import { useEffect, useState } from "react";
import { ArrowRightLeft, Copy, Languages, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { translateText } from "@/lib/translate.functions";
import { loadPrefs, SUPPORTED_TARGET_LANGUAGES } from "@/lib/storage";
import { saveResearch } from "@/lib/data";


export default TranslatorPage;

function TranslatorPage() {
  const translate = translateText;
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>("English");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ detectedLanguage: string; detectedLanguageCode: string; translation: string } | null>(null);

  // Load the user's saved default target language on mount.
  useEffect(() => { setTarget(loadPrefs().defaultTargetLanguage); }, []);

  const onTranslate = async () => {
    if (!text.trim()) {
      toast.error("Enter some text first");
      return;
    }
    setLoading(true);
    try {
      const out = await translate({ data: { text: text.trim(), target } });
      setResult(out);
      void saveResearch(`Translate→${target}: ${text.trim().slice(0, 80)}`, out);

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Translation failed");
    } finally {
      setLoading(false);
    }
  };

  const swap = () => {
    if (!result) return;
    setText(result.translation);
    setResult(null);
  };

  const copy = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <Layout>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <Languages className="h-7 w-7 text-primary" /> AI Translator
        </h1>
        <p className="text-sm text-muted-foreground">
          Auto-detect any language and translate with AI. Great for moderating comments in unfamiliar languages.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Source */}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Source</h2>
            <span className="text-[11px] text-muted-foreground">
              Auto-detected{result ? `: ${result.detectedLanguage} (${result.detectedLanguageCode})` : ""}
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste a comment, message, or any text here…"
            className="min-h-[220px] w-full resize-y rounded-md border bg-background p-3 text-sm leading-relaxed outline-none focus:border-primary"
            maxLength={5000}
          />
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{text.length}/5000</span>
            <button
              onClick={() => { setText(""); setResult(null); }}
              className="rounded px-2 py-1 hover:bg-accent"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Result */}
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Translation</h2>
            <label className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">to</span>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
              >
                {SUPPORTED_TARGET_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <div className="min-h-[220px] whitespace-pre-wrap rounded-md border border-primary/20 bg-primary/5 p-3 text-sm leading-relaxed">
            {loading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Translating…
              </span>
            ) : result ? (
              result.translation
            ) : (
              <span className="text-muted-foreground">The translation will appear here.</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => result && copy(result.translation)}
              disabled={!result}
              className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <button
              onClick={swap}
              disabled={!result}
              className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" /> Use as source
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={onTranslate}
          disabled={loading || !text.trim()}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Translate
        </button>
      </div>
    </Layout>
  );
}
