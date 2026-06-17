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

  // For HTTPS URLs (ngrok tunnel, remote host), use as-is — no hostname swap
  if (envUrl.startsWith("https://")) return envUrl.replace(/\/$/, "");

  // When the browser itself is on HTTPS (e.g. ngrok tunnel),
  // keep the env URL as-is — swapping to the frontend ngrok hostname would
  // break because the frontend tunnel only exposes the dev-server port.
  if (window.location.protocol === "https:") return envUrl.replace(/\/$/, "");

  // In development (http://localhost:8080), replace the hostname with the
  // current browser hostname so LAN/mobile devices reach the correct host.
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
