import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, Languages, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { PlatformConnections } from "@/components/PlatformConnections";
import {
  loadPrefs, savePrefs,
  SUPPORTED_TARGET_LANGUAGES, type Preferences,
} from "@/lib/storage";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ModGuard" },
      { name: "description", content: "Manage ModGuard preferences. Platform API credentials are configured server-side for security." },
      { property: "og:title", content: "Settings — ModGuard" },
      { property: "og:description", content: "Manage ModGuard preferences. Credentials are configured server-side." },
      { property: "og:url", content: "/settings" },
    ],
    links: [{ rel: "canonical", href: "/settings" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences>({ defaultTargetLanguage: "English" });

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const save = () => {
    savePrefs(prefs);
    toast.success("Preferences saved");
  };

  return (
    <Layout>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your personal preferences.</p>
      </header>

      <div className="space-y-5">
        <PlatformConnections />

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold">Platform credentials</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            For security, Twitter, Facebook, Instagram, and AI provider credentials
            are configured as server-side environment variables, not in the browser.
            Add <code className="text-xs">TWITTER_BEARER_TOKEN</code>,
            {" "}<code className="text-xs">FACEBOOK_PAGE_ACCESS_TOKEN</code> + <code className="text-xs">FACEBOOK_PAGE_ID</code>,
            {" "}<code className="text-xs">INSTAGRAM_ACCESS_TOKEN</code> + <code className="text-xs">INSTAGRAM_ACCOUNT_ID</code>
            {" "}to your project secrets. Platforms without credentials report as “Not configured”.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">Preferences</h2>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Default translation target language</span>
            <select
              value={prefs.defaultTargetLanguage}
              onChange={(e) => setPrefs({ ...prefs, defaultTargetLanguage: e.target.value })}
              className="w-full rounded-md border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {SUPPORTED_TARGET_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Only English is supported as a target language right now. Your choice is remembered across sessions.
            </span>
          </label>
        </div>
      </div>

      <div className="sticky bottom-4 mt-6 flex justify-end md:bottom-8">
        <button onClick={save} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90">
          <Save className="h-4 w-4" /> Save preferences
        </button>
      </div>
    </Layout>
  );
}
