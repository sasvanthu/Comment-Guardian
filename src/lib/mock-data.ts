export type Platform = "twitter" | "facebook" | "instagram";
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

const authors = [
  ["Alex Chen", "en", "English"],
  ["María López", "es", "Spanish"],
  ["Priya Patel", "hi", "Hindi"],
  ["Karthik R", "ta", "Tamil"],
  ["Anjali S", "ta-en", "Tanglish"],
  ["Rahul Kumar", "hi-en", "Hinglish"],
  ["Yuki Tanaka", "ja", "Japanese"],
  ["Lina Ko", "ko", "Korean"],
  ["Karim N.", "ar", "Arabic"],
  ["Wei Zhang", "zh", "Chinese"],
  ["Hans M.", "de", "German"],
  ["Sofia B.", "fr", "French"],
  ["Anonymous", "en", "English"],
  ["DarkUser99", "en", "English"],
  ["Ravi Telugu", "te", "Telugu"],
  ["Aisha U.", "ur", "Urdu"],
  ["Dipa B.", "bn", "Bengali"],
] as const;

type Bucket = { text: string; translation: string; lang: typeof authors[number][1] };

const samples: Record<Sentiment, Bucket[]> = {
  toxic: [
    { text: "This is absolute garbage, you people are clueless.", translation: "This is absolute garbage, you people are clueless.", lang: "en" },
    { text: "Eres un idiota, deja de publicar basura.", translation: "You are an idiot, stop posting garbage.", lang: "es" },
    { text: "मूर्ख हो तुम, हटाओ ये पोस्ट।", translation: "You are a fool, remove this post.", lang: "hi" },
    { text: "Bro romba mokka, delete pannu.", translation: "Bro, this is really bad, delete it.", lang: "ta-en" },
    { text: "Yaar tu pagal hai, scam kar raha hai.", translation: "Dude you're crazy, you're scamming.", lang: "hi-en" },
    { text: "உனக்கு ஒன்றும் தெரியாது, வாயை மூடு.", translation: "You don't know anything, shut up.", lang: "ta" },
    { text: "Send money to win iPhone 15! Click link →", translation: "Send money to win iPhone 15! Click link →", lang: "en" },
    { text: "I'll find you and make you regret this.", translation: "I'll find you and make you regret this.", lang: "en" },
  ],
  positive: [
    { text: "Love this! Made my day 🙌", translation: "Love this! Made my day 🙌", lang: "en" },
    { text: "¡Qué increíble trabajo, sigue así!", translation: "What an incredible job, keep it up!", lang: "es" },
    { text: "बहुत बढ़िया पोस्ट, धन्यवाद!", translation: "Very nice post, thank you!", lang: "hi" },
    { text: "Romba nalla irukku, super work!", translation: "Really nice, super work!", lang: "ta-en" },
    { text: "素晴らしい投稿、ありがとう！", translation: "Wonderful post, thank you!", lang: "ja" },
  ],
  neutral: [
    { text: "Interesting take, source please?", translation: "Interesting take, source please?", lang: "en" },
    { text: "Posté à une heure étrange mais ok.", translation: "Posted at a strange time but ok.", lang: "fr" },
    { text: "어디서 본 적 있는 것 같은데?", translation: "I think I've seen this somewhere?", lang: "ko" },
    { text: "Idk, let me think.", translation: "Idk, let me think.", lang: "en" },
  ],
};

const categoryMap: Record<Sentiment, Category[][]> = {
  toxic: [["toxic"], ["hate", "harassment"], ["cyberbullying"], ["threats"], ["spam"], ["scam"]],
  positive: [["safe"]],
  neutral: [["safe"]],
};

const platforms: Platform[] = ["twitter", "facebook", "instagram"];

// Mock data generators removed — portal now shows empty states until real
// data is ingested. Signatures preserved so existing callers compile.
// Suppress unused-warning for retained sample/category constants.
void samples; void categoryMap; void authors; void platforms;

export function generateMockComments(_n = 60): Comment[] {
  return [];
}

export function generateMockBlocked(_comments: Comment[]): BlockedUser[] {
  return [];
}

export function generateMockLogs(_comments: Comment[]): ModerationLog[] {
  return [];
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
