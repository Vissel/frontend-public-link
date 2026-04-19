// src/ProtectedRoute.js
import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

const ProtectedRoute = ({ children }) => {
  const { auth, userRole } = useAuth();

  if (!auth || String(userRole || "").toLowerCase() !== "admin") {
    return <Navigate to="/login" replace />;
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
