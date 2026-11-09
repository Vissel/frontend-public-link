// src/ProtectedRoute.js
import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext";

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .replace(/^ROLE_/i, "")
    .toLowerCase();

const ProtectedRoute = ({ allowedRoles, children }) => {
  const { auth, userRole } = useAuth();

  if (!auth) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const normalizedUserRole = normalizeRole(userRole);
    const allowed = allowedRoles.some(
      (role) => normalizeRole(role) === normalizedUserRole
    );
    if (!allowed) {
      return <Navigate to="/login" replace />;
    }
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
