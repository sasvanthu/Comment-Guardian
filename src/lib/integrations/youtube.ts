import axios from "axios";

export async function testYoutubeConnection() {
  const res = await axios.post("/api/rpc/testYoutubeConnection", {});
  return res.data;
}

export async function syncYoutubeNow() {
  const res = await axios.post("/api/rpc/syncYoutubeNow", {});
  return res.data;
}

export async function disconnectYoutube() {
  const res = await axios.post("/api/rpc/disconnectYoutube", {});
  return res.data;
}
