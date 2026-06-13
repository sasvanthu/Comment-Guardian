import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export const detectSpamScam = async (data: any) => {
  const res = await axios.post(`${API_BASE}/detectSpam`, data);
  return res.data as { isSpam: boolean; confidence: number; reason: string };
};
