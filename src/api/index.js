import axios from "axios";
import config from "./config";

const api = axios.create({
  baseURL: config.baseURL,
  withCredentials: true,
  timeout: config.timeout,
});

api.interceptors.request.use((requestConfig) => {
  const token = localStorage.getItem("token");
  if (token) {
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  requestConfig.headers["Content-Type"] = "application/json";
  return requestConfig;
});

export default api;
