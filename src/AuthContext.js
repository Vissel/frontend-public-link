// src/context/AuthContext.js
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import api from "./api";
import axios from "axios";

const AuthContext = createContext();
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const AUTH_STORAGE_KEYS = {
  token: "token",
  loginTime: "loginTime",
  userRole: "userRole",
  userName: "userName",
  refreshToken: "refreshToken",
};

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .replace(/^ROLE_/i, "")
    .toLowerCase();

const normalizeAuthData = (data = {}, fallback = {}) => {
  const token = data.token || data.accessToken || fallback.token || "";
  const username = data.username || data.userName || "";
  const rawRoles = Array.isArray(data.roles)
    ? data.roles
    : data.role
    ? [data.role]
    : [];
  const roles = rawRoles.map(normalizeRole).filter(Boolean);
  const userRole = roles[0] || normalizeRole(data.role);

  return {
    authenticated:
      data.authenticated !== false && Boolean(token || username || userRole),
    refreshToken: data.refreshToken || "",
    roles,
    token,
    userRole,
    username,
  };
};

const clearAuthStorage = () => {
  Object.values(AUTH_STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
};

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState("anonymoususer");
  const [userName, setUserName] = useState("anonymousUser");

  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.token);
    const timestamp = localStorage.getItem(AUTH_STORAGE_KEYS.loginTime);
    if (token && timestamp) {
      const elapsed = Date.now() - parseInt(timestamp, 10);
      if (elapsed < LOGIN_TIMEOUT_MS) {
        return {
          token,
          refreshToken:
            localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken) || "",
          roles: [localStorage.getItem(AUTH_STORAGE_KEYS.userRole) || ""].filter(
            Boolean
          ),
          userRole: localStorage.getItem(AUTH_STORAGE_KEYS.userRole) || "",
          username: localStorage.getItem(AUTH_STORAGE_KEYS.userName) || "",
        };
      }
      clearAuthStorage();
    }
    return null;
  });

  const applyAuthState = useCallback((data) => {
    const normalized = normalizeAuthData(data, {
      token: localStorage.getItem(AUTH_STORAGE_KEYS.token) || "",
    });

    if (!normalized.authenticated || !normalized.token) {
      setIsAuthenticated(false);
      setAuth(null);
      setUserRole("anonymoususer");
      setUserName("anonymousUser");
      clearAuthStorage();
      return null;
    }

    const loginTime = Date.now().toString();
    localStorage.setItem(AUTH_STORAGE_KEYS.token, normalized.token);
    localStorage.setItem(AUTH_STORAGE_KEYS.loginTime, loginTime);
    localStorage.setItem(AUTH_STORAGE_KEYS.userRole, normalized.userRole);
    localStorage.setItem(AUTH_STORAGE_KEYS.userName, normalized.username);

    if (normalized.refreshToken) {
      localStorage.setItem(
        AUTH_STORAGE_KEYS.refreshToken,
        normalized.refreshToken
      );
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEYS.refreshToken);
    }

    setAuth({
      token: normalized.token,
      timestamp: loginTime,
      refreshToken: normalized.refreshToken,
      roles: normalized.roles,
      userRole: normalized.userRole,
      username: normalized.username,
    });
    setIsAuthenticated(true);
    setUserRole(normalized.userRole || "anonymoususer");
    setUserName(normalized.username || "anonymousUser");

    return normalized;
  }, []);

  const checkAuthStatus = useCallback(async () => {
    if (!localStorage.getItem(AUTH_STORAGE_KEYS.token)) {
      setIsAuthenticated(false);
      setAuth(null);
      setUserRole("anonymoususer");
      setUserName("anonymousUser");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await api.get("/auth/check-auth");
      if (response.status === 200) {
        console.info("Authenticated.");
        applyAuthState(response.data);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setAuth(null);
      setUserRole("anonymoususer");
      setUserName("anonymousUser");
      clearAuthStorage();
      console.error("Authentication check failed:", error);
      if (
        axios.isAxiosError(error) &&
        error.response &&
        error.response.status === 401
      ) {
        console.log("Session expired or not authenticated.");
      } else {
        console.error("Error during session check:", error);
      }
    } finally {
      setLoading(false);
    }
  }, [applyAuthState]);

  // Check auth status on component mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = (data) => {
    return applyAuthState(data);
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUserRole("anonymoususer");
    setUserName("anonymousUser");
    clearAuthStorage();
    setAuth(null);
  };

  return (
    <AuthContext.Provider
      value={{
        auth,
        isAuthenticated,
        loading,
        login,
        logout,
        checkAuthStatus,
        userRole,
        userName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
