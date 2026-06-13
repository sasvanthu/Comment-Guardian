
import { useState } from "react";
import { Play, Save, Twitter, Facebook, Instagram } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";

export default ModerationPage;

function ModerationPage() {
  const [enabled, setEnabled] = useState(true);
  const [tw, setTw] = useState(true);
  const [fb, setFb] = useState(false);
  const [ig, setIg] = useState(true);
  const [sensitivity, setSensitivity] = useState(2);
  const [keywords, setKeywords] = useState("scam, fake, idiot, hate");
  const [schedule, setSchedule] = useState("6");

  const sensLabel = ["Low", "Medium", "High"][sensitivity - 1];

  return (
    <Layout>
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Auto Moderation</h1>
        <p className="text-sm text-muted-foreground">Set rules to automatically handle toxic content.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Master switch" desc="Globally enable or disable automatic moderation.">
          <Toggle label="Enable auto moderation" value={enabled} onChange={setEnabled} />
        </Section>

        <Section title="Per-platform" desc="Choose which platforms get auto-cleaned.">
          <Toggle icon={<Twitter className="h-4 w-4 text-twitter" />} label="Twitter — delete toxic" value={tw} onChange={setTw} />
          <Toggle icon={<Facebook className="h-4 w-4 text-facebook" />} label="Facebook — delete toxic" value={fb} onChange={setFb} />
          <Toggle icon={<Instagram className="h-4 w-4 text-pink-400" />} label="Instagram — delete toxic" value={ig} onChange={setIg} />
        </Section>

        <Section title="Sensitivity" desc={`Currently set to ${sensLabel}.`}>
          <input type="range" min={1} max={3} value={sensitivity} onChange={(e) => setSensitivity(+e.target.value)} aria-label="Moderation sensitivity level" className="w-full accent-primary" />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Low</span><span>Medium</span><span>High</span></div>
        </Section>

        <Section title="Schedule" desc="How often to run automated sweeps.">
          <select value={schedule} onChange={(e) => setSchedule(e.target.value)} className="w-full rounded-md border bg-input px-3 py-2 text-sm">
            <option value="1">Every 1 hour</option>
            <option value="6">Every 6 hours</option>
            <option value="12">Every 12 hours</option>
            <option value="24">Every 24 hours</option>
          </select>
        </Section>

        <Section title="Keyword blacklist" desc="Comma-separated terms that always trigger action." className="lg:col-span-2">
          <textarea value={keywords} onChange={(e) => setKeywords(e.target.value)} rows={3} className="w-full rounded-md border bg-input p-3 text-sm outline-none focus:border-primary" />
        </Section>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button onClick={() => toast.success("Moderation settings saved")} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Save className="h-4 w-4" /> Save Settings
        </button>
        <button onClick={() => toast.success("Manual moderation run started")} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-4 py-2 text-sm font-medium hover:bg-accent">
          <Play className="h-4 w-4" /> Run Now
        </button>
      </div>
    </Layout>
  );
}

function Section({ title, desc, children, className }: { title: string; desc: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border bg-card p-5 ${className ?? ""}`}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{desc}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Toggle({ label, value, onChange, icon }: { label: string; value: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between rounded-lg border bg-secondary/50 px-3 py-2.5 text-sm">
      <span className="flex items-center gap-2">{icon}{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${value ? "bg-primary" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </label>
  );
}
