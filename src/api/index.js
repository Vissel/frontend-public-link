import axios from "axios";
import config from "./config";
import { clearAuthStorage, getStoredAuth, storeAuth } from "../authStorage";

export const CONTEXT_PATH = "/publiclink";

const api = axios.create({
  baseURL: config.baseURL,
  withCredentials: true,
  timeout: config.timeout,
});

const pubApi = axios.create({
  baseURL: `${config.baseURL}${CONTEXT_PATH}`,
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

// ── Refresh token state ──────────────────────────────────────────────────────
// Track refresh-in-progress and queue concurrent 401 requests so only one
// refresh call is made at a time.
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Call the backend refresh endpoint with the stored refresh token,
 * then persist the new token pair.
 *
 * RefreshTokenResponse uses 'accessToken' (not 'token'), so we map it
 * when writing back to localStorage.
 */
const refreshAuthToken = async () => {
  const storedAuth = getStoredAuth();
  if (!storedAuth.refreshToken) {
    throw new Error("No refresh token available");
  }

  const response = await axios.post(
    `${config.baseURL}/api/v1/auth/refresh`,
    { refreshToken: storedAuth.refreshToken },
    { withCredentials: true, timeout: config.timeout }
  );

  const data = response.data;

  storeAuth({
    token: data.accessToken,
    refreshToken: data.refreshToken,
    userRole: data.roles?.[0] || "",
    username: data.username || "",
  });

  return data.accessToken;
};

// ── Shared 401 → refresh handler ─────────────────────────────────────────────
const createResponseErrorHandler = (instance) => {
  return async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh when:
    // - 401 received
    // - not already retried
    // - not the refresh endpoint itself (avoid infinite loop)
    // - a refresh token exists in storage
    if (
      error?.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/api/v1/auth/refresh") &&
      getStoredAuth().refreshToken
    ) {
      // Another refresh is in flight → queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
          return instance(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await refreshAuthToken();
        processQueue(null, newToken);
        originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
        return instance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthStorage();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Non-retryable 401 → just log out
    if (error?.response?.status === 401) {
      clearAuthStorage();
    }

    return Promise.reject(error);
  };
};

// ── Shared request interceptor ────────────────────────────────────────────────
const createRequestInterceptor = () => {
  return (requestConfig) => {
    const headers = requestConfig.headers || {};
    const storedAuth = getStoredAuth();

    requestConfig.headers = headers;

    // Always attach the token if we have one, even if the client-side
    // timer says it *might* be expired. The server validates the JWT
    // properly, and on 401 the response interceptor will attempt a token
    // refresh before logging the user out.
    if (storedAuth.token) {
      setHeader(headers, "Authorization", `Bearer ${storedAuth.token}`);
    }

    // Attach the logged-in username header so the backend can identify
    // the current user (e.g. for seller view detection).
    if (storedAuth.username) {
      setHeader(headers, "X-User-ID", storedAuth.username);
    }

    if (!hasHeader(headers, "Accept")) {
      setHeader(headers, "Accept", "application/json");
    }

    setHeader(headers, "Content-Type", "application/json");

    return requestConfig;
  };
};

// ── Wire up api ──────────────────────────────────────────────────────────────
api.interceptors.request.use(createRequestInterceptor());

api.interceptors.response.use(
  (response) => response,
  createResponseErrorHandler(api)
);

// ── Wire up pubApi ───────────────────────────────────────────────────────────
pubApi.interceptors.request.use(createRequestInterceptor());

pubApi.interceptors.response.use(
  (response) => response,
  createResponseErrorHandler(pubApi)
);

export default api;
export { pubApi };
