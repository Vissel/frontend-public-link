import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./page/LoginPage";
import AdminHomePage from "./page/AdminHomePage";
import GenerationPage from "./page/GenerationPage";
import SaleEnvPage from "./page/SaleEnvPage";
import RegisterPage from "./page/RegisterPage";
import EnvironmentDetailPage from "./page/EnvironmentDetailPage";

import { AuthProvider } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import SellerHome from "./page/SellerHome";
import ErrorPage from "./page/ErrorPage";
import RedirectionPage from "./page/RedirectionPage";
import Layout from "./Layout";

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <Layout>
                <LoginPage />
              </Layout>
            }
          />
          <Route
            path="/link"
            element={
              <Layout>
                <RedirectionPage />
              </Layout>
            }
          />
          <Route
            path="/api/v1/publish/saleUrl"
            element={
              <Layout>
                <SaleEnvPage />
              </Layout>
            }
          />
          <Route
            path="/api/v1/publish/register"
            element={
              <Layout>
                <RegisterPage />
              </Layout>
            }
          />
          <Route
            path="/sellerHome"
            element={
              <Layout>
                <SellerHome />
              </Layout>
            }
          />
          <Route
            path="/error"
            element={
              <Layout>
                <ErrorPage />
              </Layout>
            }
          />

          <Route element={<ProtectedRoute />}>
            <Route
              path="/adminHome"
              element={
                <Layout>
                  <AdminHomePage />
                </Layout>
              }
            />
            <Route
              path="/generationPage"
              element={
                <Layout>
                  <GenerationPage />
                </Layout>
              }
            />
            <Route
              path="/environmentDetail"
              element={
                <Layout>
                  <EnvironmentDetailPage />
                </Layout>
              }
            />
          </Route>

          <Route
            path="*"
            element={
              <Layout>
                <LoginPage />
              </Layout>
            }
          />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
