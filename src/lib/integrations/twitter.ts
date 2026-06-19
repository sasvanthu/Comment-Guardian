/**
 * Twitter / X integration — client-callable server functions.
 *
 * Exposes the server endpoints for testing, syncing, and disconnecting
 * Twitter platform connections.
 */

import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export async function testTwitterConnection() {
  const res = await axios.post(`${API_BASE}/testTwitterConnection`, {});
  return res.data;
}

export async function syncTwitterNow() {
  const res = await axios.post(`${API_BASE}/syncTwitterNow`, {});
  return res.data;
}

export async function disconnectTwitter() {
  const res = await axios.post(`${API_BASE}/disconnectTwitter`, {});
  return res.data;
}
