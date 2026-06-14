
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "sonner";
import { Plus, Trash2, Power, PowerOff, Database, Workflow } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listWorkflowRules, upsertWorkflowRule, toggleWorkflowRule,
  deleteWorkflowRule, listWorkflowExecutions,
} from "@/lib/workflows.functions";

export default WorkflowsPage;

type Condition = { field: string; op: string; value: string | number };
type Action = { type: string; params?: Record<string, unknown> };
type Rule = {
  id: string; name: string; description: string | null; enabled: boolean;
  priority: number; conditions: { all?: Condition[]; any?: Condition[] };
  actions: Action[]; run_count: number; last_run_at: string | null;
};

const FIELD_OPTIONS = [
  "risk_score", "priority", "recommendation", "sentiment", "category", "platform",
  "scores.toxicity", "scores.harassment", "scores.spam", "scores.hate",
  "scores.threats", "scores.violence", "scores.self_harm", "scores.scam",
  "scores.phishing", "emotions.anger", "emotions.frustration", "text",
];
const OPS = ["gte", "lte", "gt", "lt", "eq", "neq", "contains"];
const ACTION_TYPES = ["hide", "flag", "review", "set_status", "set_category", "log", "notify"];

function blankRule(): Omit<Rule, "id" | "run_count" | "last_run_at"> {
  return {
    name: "", description: "", enabled: true, priority: 100,
    conditions: { all: [{ field: "risk_score", op: "gte", value: 70 }] },
    actions: [{ type: "flag" }],
  };
}

function WorkflowsPage() {
  const qc = useQueryClient();
  const list = listWorkflowRules;
  const upsert = upsertWorkflowRule;
  const toggle = toggleWorkflowRule;
  const del = deleteWorkflowRule;
  const execs = listWorkflowExecutions;

  const rulesQuery = useQuery({ queryKey: ["wf-rules"], queryFn: () => list() });
  const execsQuery = useQuery({ queryKey: ["wf-execs"], queryFn: () => execs() });

  const [editing, setEditing] = useState<ReturnType<typeof blankRule> & { id?: string } | null>(null);

  const saveMut = useMutation({
    mutationFn: (r: ReturnType<typeof blankRule> & { id?: string }) => upsert({ data: r }),
    onSuccess: () => { toast.success("Rule saved"); setEditing(null); qc.invalidateQueries({ queryKey: ["wf-rules"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleMut = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggle({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wf-rules"] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["wf-rules"] }); },
  });

  const rules = (rulesQuery.data?.rules ?? []) as Rule[];
  const executions = (execsQuery.data?.executions ?? []) as Array<{
    id: string; status: string; created_at: string; error: string | null;
    actions_taken: Action[]; workflow_rules: { name: string } | null;
  }>;

  // Micro-indicator: blink when a new execution arrives during sample seeding
  const lastCountRef = useRef<number>(executions.length);
  const [fired, setFired] = useState(false);
  useEffect(() => {
    if (executions.length > lastCountRef.current) {
      setFired(true);
      const t = setTimeout(() => setFired(false), 1200);
      lastCountRef.current = executions.length;
      return () => clearTimeout(t);
    }
    lastCountRef.current = executions.length;
  }, [executions.length]);

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl flex items-center gap-2">
            <Workflow className="h-7 w-7 text-primary" /> Workflow Automation
          </h1>
          <p className="text-sm text-muted-foreground">
            IF AI-analysis matches conditions, THEN take actions automatically during sync.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditing(blankRule())}>
            <Plus className="mr-1.5 h-4 w-4" /> New rule
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {rulesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!rulesQuery.isLoading && rules.length === 0 && (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No rules yet. Click <strong>New rule</strong> to create one.
            </Card>
          )}
          {rules.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold truncate">{r.name}</h3>
                    <span className={`inline-flex items-center border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.14em] ${r.enabled ? "border-positive/55 text-positive" : "border-muted-foreground/40 text-muted-foreground"}`} style={{ borderRadius: 4 }}>
                      {r.enabled ? "● enabled" : "○ disabled"}
                    </span>
                    <span className="border border-border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ borderRadius: 4 }}>
                      priority {r.priority.toString().padStart(3, "0")}
                    </span>
                  </div>
                  {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}

                  {/* Code-logic rule render */}
                  <pre className="mt-3 overflow-x-auto border border-border bg-secondary/30 p-3 font-mono text-[11px] leading-relaxed text-foreground/85" style={{ borderRadius: 4 }}>
{`if (`}{(r.conditions.all ?? []).map((c, i) => (
  <span key={i}>{i > 0 && <span className="text-primary"> AND </span>}<span className="text-foreground/70">{c.field}</span> <span className="text-primary">{c.op}</span> <span className="text-positive">{JSON.stringify(c.value)}</span></span>
))}{r.conditions.any && r.conditions.any.length > 0 && (
  <span><span className="text-primary"> OR </span>{r.conditions.any.map((c, i) => (
    <span key={i}>{i > 0 && <span className="text-primary"> OR </span>}<span className="text-foreground/70">{c.field}</span> <span className="text-primary">{c.op}</span> <span className="text-positive">{JSON.stringify(c.value)}</span></span>
  ))}</span>
)}{`) {\n  `}{r.actions.map((a, i) => (
  <span key={i}>{i > 0 && "\n  "}<span className="text-neutral-warn">{a.type}</span>(<span className="text-foreground/60">{a.params ? JSON.stringify(a.params) : ""}</span>);</span>
))}{`\n}`}
                  </pre>

                  {/* Execution log micro-indicator */}
                  <div className="mt-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <span className={`h-1.5 w-1.5 transition-colors duration-150 ${fired ? "bg-positive animate-pulse" : "bg-muted-foreground/40"}`} />
                    exec log · runs={r.run_count.toString().padStart(4, "0")} · last={r.last_run_at ? new Date(r.last_run_at).toISOString().slice(11,19) + "Z" : "—"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon" variant="ghost" title={r.enabled ? "Disable" : "Enable"}
                    onClick={() => toggleMut.mutate({ id: r.id, enabled: !r.enabled })}>
                    {r.enabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing({
                    id: r.id, name: r.name, description: r.description ?? "", enabled: r.enabled,
                    priority: r.priority, conditions: r.conditions, actions: r.actions,
                  })}>Edit</Button>
                  <Button size="icon" variant="ghost" onClick={() => delMut.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-4 h-fit">
          <h2 className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
            <span className={`h-1.5 w-1.5 ${fired ? "bg-positive animate-pulse" : "bg-muted-foreground/40"}`} />
            Execution Log
          </h2>
          {execsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {executions.length === 0 && !execsQuery.isLoading && (
            <p className="font-mono text-[11px] text-muted-foreground">// no executions yet</p>
          )}
          <ul className="space-y-2 max-h-[480px] overflow-y-auto font-mono text-[11px]">
            {executions.map((e) => (
              <li key={e.id} className="border-l-2 border-primary/60 pl-2">
                <div className="text-foreground">{e.workflow_rules?.name ?? "Rule"}</div>
                <div className="text-muted-foreground">
                  {new Date(e.created_at).toISOString().slice(0,19).replace("T"," ")}Z · {e.status}
                  {e.error && <span className="text-destructive"> · {e.error}</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">{e.actions_taken.map((a, i) => (
                  <span key={i} className="border border-border px-1 text-[9px] uppercase tracking-[0.14em]" style={{ borderRadius: 4 }}>{a.type}</span>
                ))}</div>
              </li>
            ))}
          </ul>
        </Card>
      </div>


      {editing && (
        <RuleEditor
          value={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={() => saveMut.mutate(editing)}
          saving={saveMut.isPending}
        />
      )}
    </Layout>
  );
}

function RuleEditor({ value, onChange, onCancel, onSave, saving }: {
  value: ReturnType<typeof blankRule> & { id?: string };
  onChange: (v: ReturnType<typeof blankRule> & { id?: string }) => void;
  onCancel: () => void; onSave: () => void; saving: boolean;
}) {
  const conds = value.conditions.all ?? [];
  function updateCond(i: number, patch: Partial<Condition>) {
    const next = [...conds]; next[i] = { ...next[i], ...patch };
    onChange({ ...value, conditions: { ...value.conditions, all: next } });
  }
  function addCond() {
    onChange({ ...value, conditions: { ...value.conditions, all: [...conds, { field: "risk_score", op: "gte", value: 70 }] } });
  }
  function removeCond(i: number) {
    const next = conds.filter((_, j) => j !== i);
    onChange({ ...value, conditions: { ...value.conditions, all: next } });
  }
  function updateAction(i: number, patch: Partial<Action>) {
    const next = [...value.actions]; next[i] = { ...next[i], ...patch };
    onChange({ ...value, actions: next });
  }
  function addAction() { onChange({ ...value, actions: [...value.actions, { type: "log" }] }); }
  function removeAction(i: number) {
    onChange({ ...value, actions: value.actions.filter((_, j) => j !== i) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-semibold">{value.id ? "Edit rule" : "New rule"}</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Hide critical threats" />
            </div>
            <div>
              <Label>Priority (lower runs first)</Label>
              <Input type="number" value={value.priority} onChange={(e) => onChange({ ...value, priority: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={2} value={value.description ?? ""} onChange={(e) => onChange({ ...value, description: e.target.value })} />
          </div>

          <div>
            <Label className="mb-2 block">Conditions (ALL must match)</Label>
            <div className="space-y-2">
              {conds.map((c, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <Select value={c.field} onValueChange={(v) => updateCond(i, { field: v })}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                  </Select>
                  <Select value={c.op} onValueChange={(v) => updateCond(i, { op: v })}>
                    <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>{OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input className="w-32" value={String(c.value)} onChange={(e) => {
                    const num = Number(e.target.value);
                    updateCond(i, { value: Number.isFinite(num) && e.target.value.trim() !== "" ? num : e.target.value });
                  }} />
                  <Button size="icon" variant="ghost" onClick={() => removeCond(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addCond}><Plus className="mr-1 h-3.5 w-3.5" /> Add condition</Button>
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Actions</Label>
            <div className="space-y-2">
              {value.actions.map((a, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <Select value={a.type} onValueChange={(v) => updateAction(i, { type: v })}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>{ACTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                  {(a.type === "set_status" || a.type === "set_category" || a.type === "log" || a.type === "notify") && (
                    <Input className="flex-1" placeholder={a.type === "log" || a.type === "notify" ? "message" : "value"}
                      value={String((a.params?.[a.type === "log" || a.type === "notify" ? "message" : "value"] as string) ?? "")}
                      onChange={(e) => updateAction(i, {
                        params: { [a.type === "log" || a.type === "notify" ? "message" : "value"]: e.target.value },
                      })}/>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => removeAction(i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={addAction}><Plus className="mr-1 h-3.5 w-3.5" /> Add action</Button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onSave} disabled={saving || !value.name || value.actions.length === 0}>
            {saving ? "Saving…" : "Save rule"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
