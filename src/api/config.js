/**
 * Dynamically resolve the API base URL.
 *
 * In development, the env variable REACT_APP_API_BASE_URL contains
 * http://localhost:8080. When a mobile device on the same network
 * accesses the React dev server (e.g. http://192.168.1.6:3000),
 * API calls must target the same host — not localhost — otherwise
 * the phone tries to reach its own loopback and fails.
 *
 * Strategy: extract the port from the env variable and combine it
 * with window.location.hostname so the API base always matches
 * wherever the browser loaded the app from.
 */
const resolveBaseUrl = () => {
  const envUrl = process.env.REACT_APP_API_BASE_URL;
  if (!envUrl) return "";

  // In production, use the env variable as-is (reverse proxy handles routing)
  if (process.env.NODE_ENV === "production") return envUrl;

  // In development, replace the hostname with the current browser hostname
  try {
    const parsed = new URL(envUrl);
    parsed.hostname = window.location.hostname;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return envUrl;
  }
};

const config = {
  baseURL: resolveBaseUrl(),
  timeout: 30000,
};

export default config;
