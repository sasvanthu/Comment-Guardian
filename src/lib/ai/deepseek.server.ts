/**
 * DeepSeek moderation client (server-only).
 * Expanded taxonomy: 11 risk categories, 8 emotions, overall risk score 0..100,
 * priority, and short reason. Returns null if no API key or call fails.
 */

export type Sentiment = "positive" | "neutral" | "negative";
export type Recommendation = "allow" | "flag" | "hide";
export type Category = "toxic" | "spam" | "cyberbullying" | "neutral" | "positive";
export type Priority = "low" | "medium" | "high" | "critical";

export const SCORE_KEYS = [
  "toxicity", "harassment", "spam",
  "hate", "violence", "threats", "self_harm",
  "extremism", "sexual_harassment", "scam", "phishing",
  "misinformation", "political_abuse", "coordinated_abuse",
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const EMOTION_KEYS = [
  "anger", "joy", "sadness", "fear",
  "frustration", "disgust", "excitement", "sarcasm",
] as const;
export type EmotionKey = (typeof EMOTION_KEYS)[number];

export interface DeepSeekAnalysis {
  sentiment: Sentiment;
  toxicity_score: number;
  harassment_score: number;
  spam_score: number;
  confidence_score: number;
  recommendation: Recommendation;
  category: Category;
  priority: Priority;
  risk_score: number;            // 0..100
  scores: Record<ScoreKey, number>;
  emotions: Record<EmotionKey, number>;
  reason?: string;
  model: string;
  raw: unknown;
}

const ENDPOINT = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const SYSTEM_PROMPT = `You are an enterprise content-moderation classifier.
Given a single user comment, return STRICT JSON only (no prose) with this shape:
{
 "sentiment": "positive"|"neutral"|"negative",
 "confidence_score": 0..1,
 "recommendation": "allow"|"flag"|"hide",
 "category": "toxic"|"spam"|"cyberbullying"|"neutral"|"positive",
 "priority": "low"|"medium"|"high"|"critical",
 "risk_score": 0..100,
 "reason": short string (<=200 chars),
 "scores": {
   "toxicity":0..1,"harassment":0..1,"spam":0..1,"hate":0..1,
   "violence":0..1,"threats":0..1,"self_harm":0..1,"extremism":0..1,
   "sexual_harassment":0..1,"scam":0..1,"phishing":0..1,
   "misinformation":0..1,"political_abuse":0..1,"coordinated_abuse":0..1
 },
 "emotions": {
   "anger":0..1,"joy":0..1,"sadness":0..1,"fear":0..1,
   "frustration":0..1,"disgust":0..1,"excitement":0..1,"sarcasm":0..1
 }
}
Rules:
- "hide" when any of toxicity/harassment/hate/threats/violence/self_harm/extremism/sexual_harassment >= 0.85, or spam/scam/phishing >= 0.9.
- "flag" when any score in [0.55, 0.85).
- "allow" otherwise.
- priority: critical (risk>=85), high (>=65), medium (>=40), low (<40).
- All numeric values must be valid; never omit keys.`;

function clamp01(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}
function clamp100(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

function coerceScores(input: unknown): Record<ScoreKey, number> {
  const src = (input && typeof input === "object") ? (input as Record<string, unknown>) : {};
  const out = {} as Record<ScoreKey, number>;
  for (const k of SCORE_KEYS) out[k] = clamp01(src[k]);
  return out;
}
function coerceEmotions(input: unknown): Record<EmotionKey, number> {
  const src = (input && typeof input === "object") ? (input as Record<string, unknown>) : {};
  const out = {} as Record<EmotionKey, number>;
  for (const k of EMOTION_KEYS) out[k] = clamp01(src[k]);
  return out;
}

function derivePriority(risk: number): Priority {
  if (risk >= 85) return "critical";
  if (risk >= 65) return "high";
  if (risk >= 40) return "medium";
  return "low";
}

function deriveRiskFromScores(scores: Record<ScoreKey, number>): number {
  // Severe categories weight higher.
  const weights: Partial<Record<ScoreKey, number>> = {
    threats: 1.0, violence: 1.0, self_harm: 1.0, hate: 0.95, extremism: 0.95,
    sexual_harassment: 0.9, harassment: 0.85, toxicity: 0.75,
    scam: 0.7, phishing: 0.7, coordinated_abuse: 0.7,
    misinformation: 0.6, political_abuse: 0.55, spam: 0.4,
  };
  let max = 0;
  for (const k of SCORE_KEYS) {
    const w = weights[k] ?? 0.5;
    const v = scores[k] * w * 100;
    if (v > max) max = v;
  }
  return Math.round(max * 10) / 10;
}

function coerce(parsed: Record<string, unknown>): Omit<DeepSeekAnalysis, "model" | "raw"> {
  const scores = coerceScores(parsed.scores);
  const emotions = coerceEmotions(parsed.emotions);
  const sentiment = (["positive", "neutral", "negative"] as const).includes(parsed.sentiment as Sentiment)
    ? (parsed.sentiment as Sentiment) : "neutral";
  const conf = clamp01(parsed.confidence_score);

  const tox = scores.toxicity, har = scores.harassment, spm = scores.spam;
  let recommendation: Recommendation =
    Math.max(tox, har, scores.hate, scores.threats, scores.violence, scores.self_harm, scores.extremism, scores.sexual_harassment) >= 0.85 ||
    Math.max(spm, scores.scam, scores.phishing) >= 0.9 ? "hide" :
    Object.values(scores).some((v) => v >= 0.55) ? "flag" : "allow";
  if ((["allow", "flag", "hide"] as const).includes(parsed.recommendation as Recommendation)) {
    recommendation = parsed.recommendation as Recommendation;
  }

  let category: Category =
    scores.harassment >= 0.6 || scores.hate >= 0.6 ? "cyberbullying" :
    Math.max(tox, scores.violence, scores.threats) >= 0.6 ? "toxic" :
    Math.max(spm, scores.scam, scores.phishing) >= 0.6 ? "spam" :
    sentiment === "positive" ? "positive" : "neutral";
  if ((["toxic", "spam", "cyberbullying", "neutral", "positive"] as const).includes(parsed.category as Category)) {
    category = parsed.category as Category;
  }

  const risk = typeof parsed.risk_score === "number"
    ? clamp100(parsed.risk_score) : deriveRiskFromScores(scores);
  const priority: Priority = (["low", "medium", "high", "critical"] as const).includes(parsed.priority as Priority)
    ? (parsed.priority as Priority) : derivePriority(risk);

  return {
    sentiment,
    toxicity_score: tox,
    harassment_score: har,
    spam_score: spm,
    confidence_score: conf,
    recommendation,
    category,
    priority,
    risk_score: risk,
    scores,
    emotions,
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 280) : undefined,
  };
}

export async function analyzeWithDeepSeek(text: string): Promise<DeepSeekAnalysis | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  if (!text || !text.trim()) return null;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 700,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text.slice(0, 4000) },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(content) as Record<string, unknown>; } catch { parsed = {}; }
    return { ...coerce(parsed), model: MODEL, raw: parsed };
  } catch {
    return null;
  }
}

export function exceedsReviewThreshold(a: Pick<DeepSeekAnalysis,
  "toxicity_score" | "harassment_score" | "spam_score" | "recommendation" | "risk_score">): boolean {
  if (a.recommendation !== "allow") return true;
  if (a.risk_score >= 40) return true;
  return a.toxicity_score >= 0.6 || a.harassment_score >= 0.6 || a.spam_score >= 0.7;
}
