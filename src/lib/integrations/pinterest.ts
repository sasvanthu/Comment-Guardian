/**
 * Pinterest integration — client-callable server functions.
 *
 * Exposes the server endpoints for testing, syncing, and disconnecting
 * Pinterest platform connections.
 */

import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export async function testPinterestConnection() {
  const res = await axios.post(`${API_BASE}/testPinterestConnection`, {});
  return res.data;
}

export async function syncPinterestNow() {
  const res = await axios.post(`${API_BASE}/syncPinterestNow`, {});
  return res.data;
}

export async function disconnectPinterest() {
  const res = await axios.post(`${API_BASE}/disconnectPinterest`, {});
  return res.data;
}
