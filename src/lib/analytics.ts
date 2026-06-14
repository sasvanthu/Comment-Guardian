import type { contentItem } from "./data";

export function buildDailySeries(contentItems: contentItem[]) {
  const days: Record<string, { day: string; toxic: number; positive: number; neutral: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = d.toISOString().slice(5, 10);
    days[k] = { day: k, toxic: 0, positive: 0, neutral: 0 };
  }
  for (const c of contentItems) {
    const k = new Date(c.timestamp).toISOString().slice(5, 10);
    if (days[k]) days[k][c.sentiment]++;
  }
  return Object.values(days);
}

export function buildLanguageDistribution(contentItems: contentItem[]) {
  const map: Record<string, number> = {};
  for (const c of contentItems) map[c.languageName] = (map[c.languageName] || 0) + 1;
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}
