/**
 * Instagram integration — client-callable server functions.
 *
 * These thin wrappers expose the server-only module at
 * `src/server/integrations/instagram.ts` to the UI. All real work
/**
 * Instagram integration — client-callable server functions.
 *
 * These thin wrappers expose the server-only module at
 * `src/server/integrations/instagram.ts` to the UI. All real work
 * (Graph API calls, comment ingestion, audit + health logging) lives
 * server-side; this file only marshals input/output.
 */

import axios from "axios";

export async function testInstagramConnection() {
  const res = await axios.post("/api/rpc/testInstagramConnection", {});
  return res.data;
}

export async function syncInstagramNow() {
  const res = await axios.post("/api/rpc/syncInstagramNow", {});
  return res.data;
}

export async function disconnectInstagram() {
  const res = await axios.post("/api/rpc/disconnectInstagram", {});
  return res.data;
}
