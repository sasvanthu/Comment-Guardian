/**
 * Browser-side storage helpers.
 *
 * SECURITY: Third-party API credentials (Twitter / Facebook / Instagram /
 * OpenAI / DeepSeek) MUST NOT be persisted in the browser. Earlier versions
 * of this file kept them in localStorage, which is readable by any
 * same-origin script (XSS risk) and visible in devtools. All credential
 * persistence has been removed; configure these on the server via env vars
 * on the moderation backend instead.
 *
 * The ApiKeys / loadKeys / saveKeys / platformConnected API is preserved so
 * existing callers compile, but credentials always read back blank and
 * saveKeys is a no-op.
 */

export interface ApiKeys {
  twitterToken: string;
  facebookToken: string;
  facebookPageId: string;
  instagramToken: string;
  instagramAccountId: string;
  aiKey: string;
}

function blank(): ApiKeys {
  return {
    twitterToken: "",
    facebookToken: "",
    facebookPageId: "",
    instagramToken: "",
    instagramAccountId: "",
    aiKey: "",
  };
}

export function loadKeys(): ApiKeys {
  // Always blank — credentials are never stored in the browser.
  return blank();
}

export function saveKeys(_k: ApiKeys): void {
  // Intentionally a no-op. See file-level SECURITY note.
}

export function platformConnected(_p: "twitter" | "facebook" | "instagram"): boolean {
  // Platform connectivity is determined server-side; the UI no longer
  // claims platforms are connected based on browser-held credentials.
  return false;
}

// --- User preferences (non-secret, safe to persist in localStorage) ---
export interface Preferences {
  /** Default target language for the translator and comment-card translations. */
  defaultTargetLanguage: string;
}

const PREFS_KEY = "modtool.prefs";
const DEFAULT_PREFS: Preferences = { defaultTargetLanguage: "English" };

// Only English is supported as a target language for now.
export const SUPPORTED_TARGET_LANGUAGES = ["English"] as const;

export function loadPrefs(): Preferences {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const parsed = raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
    if (!SUPPORTED_TARGET_LANGUAGES.includes(parsed.defaultTargetLanguage as typeof SUPPORTED_TARGET_LANGUAGES[number])) {
      parsed.defaultTargetLanguage = DEFAULT_PREFS.defaultTargetLanguage;
    }
    return parsed;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Preferences) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREFS_KEY, JSON.stringify(p));
}
