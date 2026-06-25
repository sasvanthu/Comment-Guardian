/**
 * LinkedIn integration — client-callable server functions.
 *
 * Exposes the server endpoints for testing, syncing, and disconnecting
 * LinkedIn platform connections.
 */

import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export async function testLinkedinConnection() {
  const res = await axios.post(`${API_BASE}/testLinkedinConnection`, {});
  return res.data;
}

export async function syncLinkedinNow() {
  const res = await axios.post(`${API_BASE}/syncLinkedinNow`, {});
  return res.data;
}

export async function disconnectLinkedin() {
  const res = await axios.post(`${API_BASE}/disconnectLinkedin`, {});
  return res.data;
}
