
import { useEffect, useState } from "react";
import { Save, Languages, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { PlatformConnections } from "@/components/PlatformConnections";
import {
  loadPrefs, savePrefs,
  SUPPORTED_TARGET_LANGUAGES, type Preferences,
} from "@/lib/storage";

export default SettingsPage;

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
            For security, platform credentials are configured as server-side environment variables,
            not in the browser. Add the following to your{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">.env</code> file:
          </p>
          <div className="mt-3 space-y-2 text-[12px]">
            <div className="rounded-md bg-background/60 p-3 border">
              <p className="font-semibold text-red-400 mb-1">▸ YouTube (OAuth 2.0)</p>
              <p className="text-muted-foreground">
                <code className="text-[11px]">YOUTUBE_OAUTH_CLIENT_ID</code> + <code className="text-[11px]">YOUTUBE_OAUTH_CLIENT_SECRET</code>
              </p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Get these from <span className="text-foreground">Google Cloud Console → APIs & Services → Credentials</span>.
                Use the "Connect with Google" button on the Platform Connections panel above to authorize.
              </p>
            </div>
            <div className="rounded-md bg-background/60 p-3 border">
              <p className="font-semibold text-sky-400 mb-1">▸ Twitter / X</p>
              <p className="text-muted-foreground">
                <code className="text-[11px]">TWITTER_BEARER_TOKEN</code> + <code className="text-[11px]">TWITTER_USER_ID</code>{" "}
                <span className="text-[10px]">(optional)</span>
              </p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Get these from <span className="text-foreground">X Developer Portal → Projects & Apps → Keys & Tokens</span>.
                The bearer token enables read access. User ID auto-resolves if not set.
              </p>
            </div>
            <div className="rounded-md bg-background/60 p-3 border">
              <p className="font-semibold text-blue-400 mb-1">▸ Facebook</p>
              <p className="text-muted-foreground">
                <code className="text-[11px]">FACEBOOK_PAGE_ACCESS_TOKEN</code> + <code className="text-[11px]">FACEBOOK_PAGE_ID</code>
              </p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Get these from <span className="text-foreground">Meta Developer Portal → Your App → Graph API Explorer</span>.
                Generate a Page Access Token with <code className="text-[10px]">pages_read_engagement</code> + <code className="text-[10px]">pages_manage_metadata</code> permissions.
              </p>
            </div>
            <div className="rounded-md bg-background/60 p-3 border">
              <p className="font-semibold text-fuchsia-400 mb-1">▸ Instagram</p>
              <p className="text-muted-foreground">
                <code className="text-[11px]">INSTAGRAM_ACCESS_TOKEN</code> + <code className="text-[11px]">INSTAGRAM_ACCOUNT_ID</code>
              </p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Get these from <span className="text-foreground">Meta Developer Portal → Instagram Graph API</span>.
                Requires a Facebook Page linked to an Instagram Professional account.
              </p>
            </div>
            <div className="rounded-md bg-background/60 p-3 border border-dashed">
              <p className="font-semibold text-green-400 mb-1">▸ Backend Auth</p>
              <p className="text-muted-foreground">
                <code className="text-[11px]">API_AUTH_TOKEN</code> — random secret to protect the moderation backend API
              </p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Platforms without credentials will report as "Not configured".
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
