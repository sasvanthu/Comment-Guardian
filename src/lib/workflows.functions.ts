/**
 * Workflow rules CRUD + sample-data seed.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OpEnum = z.enum(["gte", "lte", "gt", "lt", "eq", "neq", "in", "contains"]);
const ConditionSchema = z.object({
  field: z.string().min(1).max(64),
  op: OpEnum,
  value: z.unknown(),
});
const ConditionsSchema = z.object({
  all: z.array(ConditionSchema).optional(),
  any: z.array(ConditionSchema).optional(),
}).default({ all: [] });

const ActionSchema = z.object({
  type: z.enum(["hide", "flag", "review", "set_status", "set_category", "log", "notify"]),
  params: z.record(z.string(), z.unknown()).optional(),
});

const RuleInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(1000).default(100),
  conditions: ConditionsSchema,
  actions: z.array(ActionSchema).min(1).max(10),
});

type SBClient = { from: (t: string) => any };
type Ctx = { supabase: SBClient; userId: string };

export const listWorkflowRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data, error } = await supabase
      .from("workflow_rules")
      .select("*")
      .eq("user_id", userId)
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return { rules: data ?? [] };
  });

export const upsertWorkflowRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RuleInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const row = {
      user_id: userId,
      name: data.name,
      description: data.description ?? null,
      enabled: data.enabled,
      priority: data.priority,
      conditions: data.conditions,
      actions: data.actions,
    };
    if (data.id) {
      const { error } = await supabase.from("workflow_rules").update(row).eq("id", data.id).eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("workflow_rules").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

export const toggleWorkflowRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { error } = await supabase.from("workflow_rules")
      .update({ enabled: data.enabled }).eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteWorkflowRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { error } = await supabase.from("workflow_rules").delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWorkflowExecutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data, error } = await supabase
      .from("workflow_executions")
      .select("id, rule_id, comment_id, status, actions_taken, error, created_at, workflow_rules!inner(name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { executions: data ?? [] };
  });

/* ------------------------------------------------------------------ */
/*  Sample data seed — ~1k synthetic comments + ai_analysis            */
/* ------------------------------------------------------------------ */

const AUTHORS = ["@aiden", "@maya", "@jordan_b", "@chris99", "@sara.k", "@noahd", "@lily.r",
  "@kev_t", "@anonuser", "@brand_hater", "@scammer_77", "@positive_pat"];
const PLATFORMS = ["twitter", "facebook", "instagram"] as const;
const TEMPLATES = [
  { text: "Love this product, it's amazing!", sentiment: "positive", category: "positive", risk: 5 },
  { text: "Pretty average tbh, nothing special.", sentiment: "neutral", category: "neutral", risk: 10 },
  { text: "You all are absolute idiots running this brand.", sentiment: "negative", category: "toxic", risk: 70 },
  { text: "Buy crypto here 100x guaranteed http://scam.link", sentiment: "neutral", category: "spam", risk: 80 },
  { text: "I'm going to find you and make you pay for this.", sentiment: "negative", category: "cyberbullying", risk: 95 },
  { text: "Looks great, thanks for sharing!", sentiment: "positive", category: "positive", risk: 3 },
  { text: "This is the worst customer service ever.", sentiment: "negative", category: "neutral", risk: 35 },
  { text: "Get 90% off ️ click here now", sentiment: "neutral", category: "spam", risk: 75 },
  { text: "Everyone should boycott this trash company.", sentiment: "negative", category: "toxic", risk: 55 },
  { text: "Nice update, looking forward to the next one.", sentiment: "positive", category: "positive", risk: 2 },
];

function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(n: number) { return Math.floor(Math.random() * n); }

export const seedSampleData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ count: z.number().int().min(1).max(2000).default(1000) }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const now = Date.now();
    const commentRows = Array.from({ length: data.count }, (_, i) => {
      const t = pick(TEMPLATES);
      const platform = pick(PLATFORMS);
      const created = new Date(now - rand(30 * 24 * 3600 * 1000)).toISOString();
      const status = t.risk >= 85 ? "hidden" : t.risk >= 55 ? "flagged" : "allowed";
      const review = t.risk >= 40 ? "pending" : "approved";
      return {
        user_id: userId,
        platform,
        author: pick(AUTHORS),
        text: `${t.text} (#${i + 1})`,
        external_id: `seed-${now}-${i}`,
        sentiment: t.sentiment,
        category: t.category,
        status,
        review_status: review,
        created_at: created,
      };
    });

    // Insert in chunks of 200
    const inserted: Array<{ id: string; text: string }> = [];
    for (let i = 0; i < commentRows.length; i += 200) {
      const slice = commentRows.slice(i, i + 200);
      const { data: rows, error } = await supabase
        .from("comments").insert(slice).select("id, text");
      if (error) throw new Error(error.message);
      inserted.push(...((rows ?? []) as Array<{ id: string; text: string }>));
    }

    // Build synthetic ai_analysis rows aligned to templates.
    const ai = inserted.map((r) => {
      // Recover template via text prefix
      const tpl = TEMPLATES.find((t) => r.text.startsWith(t.text)) ?? TEMPLATES[1];
      const risk = tpl.risk + (rand(11) - 5);
      const tox = tpl.category === "toxic" || tpl.category === "cyberbullying" ? 0.6 + Math.random() * 0.4 : Math.random() * 0.3;
      const har = tpl.category === "cyberbullying" ? 0.7 + Math.random() * 0.3 : Math.random() * 0.3;
      const spm = tpl.category === "spam" ? 0.7 + Math.random() * 0.3 : Math.random() * 0.2;
      const priority = risk >= 85 ? "critical" : risk >= 65 ? "high" : risk >= 40 ? "medium" : "low";
      return {
        user_id: userId, comment_id: r.id,
        sentiment: tpl.sentiment,
        toxicity_score: +tox.toFixed(3),
        harassment_score: +har.toFixed(3),
        spam_score: +spm.toFixed(3),
        confidence_score: +(0.7 + Math.random() * 0.3).toFixed(3),
        recommendation: risk >= 85 ? "hide" : risk >= 55 ? "flag" : "allow",
        risk_score: Math.max(0, Math.min(100, risk)),
        priority,
        scores: { toxicity: tox, harassment: har, spam: spm,
          hate: tox * 0.7, violence: tox * 0.5, threats: tpl.risk >= 90 ? 0.9 : 0.1,
          self_harm: 0, extremism: tox * 0.3, sexual_harassment: 0,
          scam: spm, phishing: spm * 0.7, misinformation: 0,
          political_abuse: 0, coordinated_abuse: 0 },
        emotions: { anger: tpl.sentiment === "negative" ? 0.7 : 0.1, joy: tpl.sentiment === "positive" ? 0.8 : 0.05,
          sadness: 0.1, fear: 0, frustration: tpl.sentiment === "negative" ? 0.5 : 0.1,
          disgust: tox * 0.4, excitement: tpl.sentiment === "positive" ? 0.6 : 0.1, sarcasm: 0.1 },
        reason: `Seed: ${tpl.category}`,
        model: "seed-fixture",
        raw: { seed: true },
      };
    });

    for (let i = 0; i < ai.length; i += 200) {
      const slice = ai.slice(i, i + 200);
      const { error } = await supabase.from("ai_analysis").insert(slice);
      if (error) throw new Error(error.message);
    }
    return { inserted: inserted.length };
  });
