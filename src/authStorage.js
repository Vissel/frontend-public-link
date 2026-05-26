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

export const clearAuthStorage = () => {
  Object.values(AUTH_STORAGE_KEYS).forEach((key) =>
    localStorage.removeItem(key)
  );
  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
};

export const storeAuth = ({
  loginTime = Date.now().toString(),
  refreshToken = "",
  token = "",
  userRole = "",
  username = "",
}) => {
  localStorage.setItem(AUTH_STORAGE_KEYS.token, token);
  localStorage.setItem(AUTH_STORAGE_KEYS.loginTime, loginTime);
  localStorage.setItem(AUTH_STORAGE_KEYS.userRole, userRole);
  localStorage.setItem(AUTH_STORAGE_KEYS.username, username);

  if (refreshToken) {
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, refreshToken);
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
  }

  window.dispatchEvent(new Event(AUTH_STATE_EVENT));
  return loginTime;
};

export const getStoredAuth = () => {
  const token = localStorage.getItem(AUTH_STORAGE_KEYS.token) || "";
  const loginTime = localStorage.getItem(AUTH_STORAGE_KEYS.loginTime) || "";
  const parsedLoginTime = Number.parseInt(loginTime, 10);
  const isExpired = Boolean(token) &&
    (!loginTime ||
      Number.isNaN(parsedLoginTime) ||
      Date.now() - parsedLoginTime >= LOGIN_TIMEOUT_MS);
  const userRole = localStorage.getItem(AUTH_STORAGE_KEYS.userRole) || "";
  const refreshToken = localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken) || "";

  return {
    isAuthenticated: Boolean(token) || Boolean(refreshToken),
    isExpired,
    loginTime,
    refreshToken,
    roles: [userRole].filter(Boolean),
    token,
    userRole,
    username: localStorage.getItem(AUTH_STORAGE_KEYS.username) || "",
  };
};
