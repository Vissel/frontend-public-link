// src/ProtectedRoute.js
import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import {useAuth} from './AuthContext'

const ProtectedRoute = ({ children }) => {
  const { auth } = useAuth();
  
  if (!auth) {
        // Redirect to the login page if not authenticated
        return <Navigate to="/login" replace />;
    }

    // Render the children (the protected component) or Outlet for nested routes
    return children ? children : <Outlet />;
};

export default ProtectedRoute;
