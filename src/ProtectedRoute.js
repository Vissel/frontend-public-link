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
      // The session is valid, the account simply is not allowed here. Without
      // a reason this lands the user on a spotless login form, so they sign in
      // again and get bounced with nothing to read.
      return (
        <Navigate
          to="/login"
          replace
          state={{ deniedRole: normalizeRole(userRole) || "none" }}
        />
      );
    }
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
