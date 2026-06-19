/**
 * Facebook integration — client-callable server functions.
 *
 * Exposes the server endpoints for testing, syncing, and disconnecting
 * Facebook platform connections.
 */

import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export async function testFacebookConnection() {
  const res = await axios.post(`${API_BASE}/testFacebookConnection`, {});
  return res.data;
}

export async function syncFacebookNow() {
  const res = await axios.post(`${API_BASE}/syncFacebookNow`, {});
  return res.data;
}

export async function disconnectFacebook() {
  const res = await axios.post(`${API_BASE}/disconnectFacebook`, {});
  return res.data;
}
