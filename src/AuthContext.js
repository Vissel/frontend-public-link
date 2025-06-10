// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from "react";
import api from "./api";
import axios from "axios";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true); // To indicate if auth status is being checked

  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem("token");
    const timestamp = localStorage.getItem("loginTime");
    if (token && timestamp) {
      const elapsed = Date.now() - parseInt(timestamp, 10);
      if (elapsed < 15 * 60 * 1000) return { token };
      localStorage.clear();
    }
    return null;
  });

  // Function to check authentication status (e.g., by hitting a protected endpoint)
  const checkAuthStatus = async () => {
    setLoading(true);
    try {
      // A simple protected endpoint, e.g., /api/user-info or just /api/hello
      // If the request succeeds, it means the session is active (user is authenticated)
      const auth = await api.get("/auth/check-auth");
      if (auth.status === 200) {
        console.info("Authenticated.");
        setIsAuthenticated(true);
      }
    } catch (error) {
      setIsAuthenticated(false);
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
  };

  // Check auth status on component mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const login = (token) => {
    setIsAuthenticated(true);
    localStorage.setItem("token", token);
    localStorage.setItem("loginTime", Date.now().toString());
    setAuth({ token });
  };
  const logout = () => {
    setIsAuthenticated(false);
    localStorage.clear();
    setAuth(null);
  };
  return (
    <AuthContext.Provider
      value={{ auth, isAuthenticated, loading, login, logout, checkAuthStatus }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);