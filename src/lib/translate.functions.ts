import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export const translateText = async (data: any) => {
  const res = await axios.post(`${API_BASE}/translateText`, data);
  return res.data as { translation: string; detectedLanguage: string };
};
