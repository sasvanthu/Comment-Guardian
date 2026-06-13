import axios from "axios";
import { z } from "zod";

const API_BASE = "http://localhost:5000/api/rpc";

export const AnalyzeResult = z.object({
  toxicity: z.number(),
  cyberbullyingProbability: z.number(),
  sentiment: z.enum(["toxic", "neutral", "positive"]),
  severity: z.enum(["Low", "Medium", "High", "Critical"]),
  categories: z.array(z.string()),
  recommendedAction: z.enum(["Allow", "Flag", "Hide & Review", "Delete", "Block User"]),
  confidence: z.number(),
  reason: z.string(),
  signals: z.array(z.string()),
});

export const ResearchResult = z.object({
  riskLevel: z.enum(["Low", "Medium", "High", "Critical"]),
  riskScore: z.number(),
  profileType: z.string(),
  summary: z.string(),
  patterns: z.array(z.string()),
  topCategories: z.array(z.string()),
  evidence: z.array(z.object({ quote: z.string(), why: z.string() })),
  recommendedAction: z.enum(["Monitor", "Warn", "Mute", "Suspend", "Permanent block"]),
  confidence: z.number(),
});

export const analyzeToxic = async (data: any) => {
  const res = await axios.post(`${API_BASE}/analyzeToxic`, data);
  return res.data;
};

export const researchUser = async (data: any) => {
  const res = await axios.post(`${API_BASE}/researchUser`, data);
  return res.data;
};
