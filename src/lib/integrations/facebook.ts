/**
 * Facebook integration — client-callable server functions.
 *
 * Exposes the server endpoints for testing, syncing, and disconnecting
 * Facebook platform connections.
 */

import axios from "axios";

export async function testFacebookConnection() {
  const res = await axios.post("/api/rpc/testFacebookConnection", {});
  return res.data;
}

export async function syncFacebookNow() {
  const res = await axios.post("/api/rpc/syncFacebookNow", {});
  return res.data;
}

export async function disconnectFacebook() {
  const res = await axios.post("/api/rpc/disconnectFacebook", {});
  return res.data;
}
