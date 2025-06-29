// src/App.js (or your main routing component)
import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./page/LoginPage";
import HomePage from "./page/HomePage";
import GenerationPage from "./page/GenerationPage";
import SaleEnvPage from "./page/SaleEnvPage";
import RegisterPage from "./page/RegisterPage";

import { AuthProvider } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import SellerHome from "./page/SellerHome";
import ErrorPage from "./page/ErrorPage";
import Layout from "./Layout";

function App() {
  return (
    <Router>
      <AuthProvider>
        {" "}
        {/* Wrap your entire app with AuthProvider */}
        <Routes>
          {/* Public routes */}
          
          <Route path="/login" element={<Layout> <LoginPage /> </Layout> } />
          <Route path="/public/link" element={<Layout><SaleEnvPage /></Layout> } />
          <Route path="/public/register" element={<Layout><RegisterPage /></Layout> } />
          <Route path="/sellerHome" element={<Layout><SellerHome /></Layout> } />
          <Route path="/error" element={<Layout><ErrorPage /></Layout> } />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            {" "}
            {/* Use ProtectedRoute as a wrapper */}
            <Route path="/home" element={<Layout><HomePage /></Layout> } />
            <Route path="/generationPage" element={<Layout><GenerationPage /></Layout> } />
          </Route>

          {/* Default/Catch-all route */}
          <Route path="*" element={<Layout><LoginPage /></Layout> } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
