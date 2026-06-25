export type Platform = "twitter" | "facebook" | "instagram" | "youtube" | "linkedin" | "pinterest";
export type Sentiment = "toxic" | "positive" | "neutral";
export type Category =
  | "safe"
  | "toxic"
  | "hate"
  | "harassment"
  | "cyberbullying"
  | "threats"
  | "spam"
  | "scam"
  | "sexual"
  | "misinformation";
export type Decision = "allow" | "review" | "delete" | "block";

export interface Comment {
  id: string;
  platform: Platform;
  author: string;
  authorId: string;
  text: string;
  sentiment: Sentiment;
  /** Toxicity 0-100 (kept for backwards compatibility) */
  toxicity: number;
  toxicityScore: number;
  sentimentScore: number;
  confidence: number;
  language: string;       // ISO code
  languageName: string;
  translation: string;    // English
  categories: Category[];
  decision: Decision;
  timestamp: string;
}

export interface BlockedUser {
  userId: string;
  username: string;
  platform: Platform;
  reason: string;
  categories: Category[];
  ip?: string | null;
  timestamp: string;
}

export interface ModerationLog {
  id: string;
  action: "delete" | "block" | "restore" | "allow" | "hide" | "unblock";
  commentId?: string;
  userId?: string;
  platform: Platform;
  reason: string;
  scores?: { toxicity: number; sentiment: number; confidence: number };
  timestamp: string;
}

export function buildDailySeries(comments: Comment[]) {
  const days: Record<string, { day: string; toxic: number; positive: number; neutral: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = d.toISOString().slice(5, 10);
    days[k] = { day: k, toxic: 0, positive: 0, neutral: 0 };
  }
  for (const c of comments) {
    const k = new Date(c.timestamp).toISOString().slice(5, 10);
    if (days[k]) days[k][c.sentiment]++;
  }
  return Object.values(days);
}

export function buildLanguageDistribution(comments: Comment[]) {
  const map: Record<string, number> = {};
  for (const c of comments) map[c.languageName] = (map[c.languageName] || 0) + 1;
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
