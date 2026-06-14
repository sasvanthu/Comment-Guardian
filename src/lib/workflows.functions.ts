import axios from "axios";

const API_BASE = "http://localhost:5000/api/rpc";

export const listWorkflowRules = async () => (await axios.get(`${API_BASE}/listWorkflowRules`)).data;
export const upsertWorkflowRule = async (data: any) => (await axios.post(`${API_BASE}/upsertWorkflowRule`, data)).data;
export const toggleWorkflowRule = async (data: any) => (await axios.post(`${API_BASE}/toggleWorkflowRule`, data)).data;
export const deleteWorkflowRule = async (data: any) => (await axios.post(`${API_BASE}/deleteWorkflowRule`, data)).data;
export const listWorkflowExecutions = async () => (await axios.get(`${API_BASE}/listWorkflowExecutions`)).data;
