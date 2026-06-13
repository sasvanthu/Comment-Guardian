import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export const listPlatformConnections = async () => (await axios.get(`${API_BASE}/listPlatformConnections`)).data;
export const disconnectPlatform = async (data: any) => (await axios.post(`${API_BASE}/disconnectPlatform`, data)).data;
export const syncPlatform = async (data: any) => (await axios.post(`${API_BASE}/syncPlatform`, data)).data;
export const syncAllPlatforms = async () => (await axios.post(`${API_BASE}/syncAllPlatforms`)).data;
