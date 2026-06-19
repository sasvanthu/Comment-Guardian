import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export async function testInstagramConnection() {
  const res = await axios.post(`${API_BASE}/testInstagramConnection`, {});
  return res.data;
}

export async function syncInstagramNow() {
  const res = await axios.post(`${API_BASE}/syncInstagramNow`, {});
  return res.data;
}

export async function disconnectInstagram() {
  const res = await axios.post(`${API_BASE}/disconnectInstagram`, {});
  return res.data;
}
