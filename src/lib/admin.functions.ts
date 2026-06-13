import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  roles: ("admin" | "user")[];
  created_at: string;
  last_sign_in_at: string | null;
}

export const listUsers = async () => (await axios.get(`${API_BASE}/listUsers`)).data;
export const createUser = async (data: any) => (await axios.post(`${API_BASE}/createUser`, data)).data;
export const deleteUser = async (data: any) => (await axios.post(`${API_BASE}/deleteUser`, data)).data;
export const setUserRole = async (data: any) => (await axios.post(`${API_BASE}/setUserRole`, data)).data;
