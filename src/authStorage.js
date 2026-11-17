/**
 * Per-TAB authentication session.
 *
 * This used to live in localStorage, which is shared by every tab of one
 * browser. Two accounts could therefore never coexist: signing in as micro09
 * in a second tab fired a `storage` event that flipped the first tab (micro08)
 * to micro09, and the chat widget - which follows the signed-in account - then
 * resumed micro09's thread and wrote micro08's messages into it.
 *
 * sessionStorage is scoped to one tab, so each tab keeps its own login and its
 * own chat identity. The legacy localStorage keys are never read back (copying
 * them into a tab would import whichever account logged in last); they are
 * removed on the next store/clear so no stale browser-global session survives.
 */

export const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
export const AUTH_STATE_EVENT = "auth-state-changed";

export const AUTH_STORAGE_KEYS = {
  token: "token",
  loginTime: "loginTime",
  userRole: "userRole",
  username: "username",
  refreshToken: "refreshToken",
};

export const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .replace(/^ROLE_/i, "")
    .toLowerCase();

// sessionStorage can throw in some privacy modes; fall back to a page-lifetime
// map so the app still works, just without surviving a reload.
const memorySession = new Map();

const session = () => {
  try {
    const probe = "__auth_probe__";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const read = (key) => {
  const store = session();
  return store ? store.getItem(key) || "" : memorySession.get(key) || "";
};

const write = (key, value) => {
  const store = session();
  if (store) {
    if (value) store.setItem(key, value);
    else store.removeItem(key);
  } else if (value) {
    memorySession.set(key, value);
  } else {
    memorySession.delete(key);
  }
};

/** Drops the dead browser-global session left by releases before per-tab auth. */
const purgeLegacyLocalSession = () => {
  try {
    Object.values(AUTH_STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage disabled: nothing to purge */
  }
};

export const clearAuthStorage = () => {
  Object.values(AUTH_STORAGE_KEYS).forEach((key) => write(key, ""));
  purgeLegacyLocalSession();
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
};

export const storeAuth = ({
  loginTime = Date.now().toString(),
  refreshToken = "",
  token = "",
  userRole = "",
  username = "",
}) => {
  write(AUTH_STORAGE_KEYS.token, token);
  write(AUTH_STORAGE_KEYS.loginTime, loginTime);
  write(AUTH_STORAGE_KEYS.userRole, userRole);
  write(AUTH_STORAGE_KEYS.username, username);
  write(AUTH_STORAGE_KEYS.refreshToken, refreshToken);
  purgeLegacyLocalSession();

  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
  return loginTime;
};

export const getStoredAuth = () => {
  const token = read(AUTH_STORAGE_KEYS.token);
  const loginTime = read(AUTH_STORAGE_KEYS.loginTime);
  const parsedLoginTime = Number.parseInt(loginTime, 10);
  const refreshToken = read(AUTH_STORAGE_KEYS.refreshToken);
  const accessTokenTimedOut = Boolean(token) &&
    (!loginTime ||
      Number.isNaN(parsedLoginTime) ||
      Date.now() - parsedLoginTime >= LOGIN_TIMEOUT_MS);
  // Keep the session restorable while a refresh token is still available.
  const isExpired = accessTokenTimedOut && !refreshToken;
  const userRole = read(AUTH_STORAGE_KEYS.userRole);

  return {
    isAuthenticated: Boolean(token) || Boolean(refreshToken),
    isExpired,
    loginTime,
    refreshToken,
    roles: [userRole].filter(Boolean),
    token,
    userRole,
    username: read(AUTH_STORAGE_KEYS.username),
  };
};
