// src/context/AuthContext.js
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  AUTH_STATE_EVENT,
  clearAuthStorage,
  getStoredAuth,
  normalizeRole,
  storeAuth,
} from "./authStorage";

const AuthContext = createContext();

const normalizeAuthData = (data = {}, fallback = {}) => {
  const token = data.token || fallback.token || "";
  const username = data.username || "";
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
export const AuthProvider = ({ children }) => {
  const getUnauthenticatedState = useCallback(() => {
    return {
      auth: null,
      isAuthenticated: false,
      userRole: "anonymoususer",
      username: "anonymousUser",
    };
  }, []);

  const getAuthStateFromStorage = useCallback(() => {
    const storedAuth = getStoredAuth();
    if (storedAuth.isExpired) {
      clearAuthStorage();
      return getUnauthenticatedState();
    }
    if (storedAuth.isAuthenticated) {
      return {
        auth: {
          token: storedAuth.token,
          refreshToken: storedAuth.refreshToken,
          roles: storedAuth.roles,
          userRole: storedAuth.userRole,
          username: storedAuth.username,
        },
        isAuthenticated: true,
        userRole: storedAuth.userRole || "anonymoususer",
        username: storedAuth.username || "anonymousUser",
      };
    }
    return getUnauthenticatedState();
  }, [getUnauthenticatedState]);

  const [authState, setAuthState] = useState(getAuthStateFromStorage);
  const { auth, isAuthenticated, userRole, username } = authState;
  const [loading, setLoading] = useState(false);

  const syncAuthState = useCallback(() => {
  setAuthState(getAuthStateFromStorage());
    setLoading(false);
  }, [getAuthStateFromStorage]);

  const applyAuthState = useCallback((data) => {
    const normalized = normalizeAuthData(data, {
      token: getStoredAuth().token,
    });

    if (!normalized.authenticated || !normalized.token) {
      clearAuthStorage();
      return null;
    }

    const loginTime = storeAuth({
      refreshToken: normalized.refreshToken,
      token: normalized.token,
      userRole: normalized.userRole,
      username: normalized.username,
    });

    setAuthState({
      auth: {
        token: normalized.token,
        timestamp: loginTime,
        refreshToken: normalized.refreshToken,
        roles: normalized.roles,
        userRole: normalized.userRole,
        username: normalized.username,
      },
      isAuthenticated: true,
      userRole: normalized.userRole || "anonymoususer",
      username: normalized.username || "anonymousUser",
    });

    return normalized;
  }, []);

  useEffect(() => {
    syncAuthState();

    window.addEventListener(AUTH_STATE_EVENT, syncAuthState);
    window.addEventListener("storage", syncAuthState);

    return () => {
      window.removeEventListener(AUTH_STATE_EVENT, syncAuthState);
      window.removeEventListener("storage", syncAuthState);
    };
  }, [syncAuthState]);

  const login = (data) => {
    return applyAuthState(data);
  };

  const logout = () => {
    clearAuthStorage();
    setAuthState(getUnauthenticatedState());
  };

  return (
    <AuthContext.Provider
      value={{
        auth,
        isAuthenticated,
        loading,
        login,
        logout,
        userRole,
        username,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
