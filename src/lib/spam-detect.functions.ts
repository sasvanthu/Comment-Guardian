import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export interface SpamCheckPayload {
  data: {
    items: { id: string; text: string }[];
  };
}

export interface SpamCheckResult {
  results: {
    id: string;
    label: string;
    confidence: number;
    reason: string;
    signals: string[];
  }[];
}

export const detectSpamScam = async (payload: SpamCheckPayload): Promise<SpamCheckResult> => {
  const item = payload.data.items[0];
  if (!item) {
    return { results: [] };
  }
  const res = await axios.post(`${API_BASE}/detectSpam`, { text: item.text });
  const data = res.data as { isSpam: boolean; confidence: number; reason: string };
  return {
    results: [
      {
        id: item.id,
        label: data.isSpam ? "SPAM" : "CLEAN",
        confidence: data.confidence,
        reason: data.reason,
        signals: data.isSpam ? ["Spam patterns detected"] : [],
      },
    ],
  };
};
