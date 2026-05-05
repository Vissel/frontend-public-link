import axios from "axios";
import config from "./config";
import { clearAuthStorage, getStoredAuth } from "../authStorage";

const api = axios.create({
  baseURL: config.baseURL,
  withCredentials: true,
  timeout: config.timeout,
});

const hasHeader = (headers, name) => {
  if (!headers) {
    return false;
  }
  if (typeof headers.has === "function") {
    return headers.has(name);
  }

  return Object.keys(headers).some((key) => key.toLowerCase() === name.toLowerCase());
};

const setHeader = (headers, name, value) => {
  if (typeof headers.set === "function") {
    headers.set(name, value);
    return;
  }
  headers[name] = value;
};

const removeHeader = (headers, name) => {
  if (!headers) {
    return;
  }
  if (typeof headers.delete === "function") {
    headers.delete(name);
    return;
  }

  Object.keys(headers).forEach((key) => {
    if (key.toLowerCase() === name.toLowerCase()) {
      delete headers[key];
    }
  });
};

api.interceptors.request.use((requestConfig) => {
  const headers = requestConfig.headers || {};
  const storedAuth = getStoredAuth();

  requestConfig.headers = headers;

  if (storedAuth.isExpired) {
    clearAuthStorage();
    removeHeader(headers, "Authorization");
    return requestConfig;
  }

  if (storedAuth.token) {
    setHeader(headers, "Authorization", `Bearer ${storedAuth.token}`);
  }

  if (!hasHeader(headers, "Accept")) {
    setHeader(headers, "Accept", "application/json");
  }

  setHeader(headers, "Content-Type", "application/json");

  return requestConfig;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthStorage();
    }

    return Promise.reject(error);
  }
);

export default api;
