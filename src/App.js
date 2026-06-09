import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./page/LoginPage";
import AdminHomePage from "./page/AdminHomePage";
import GenerationPage from "./page/GenerationPage";
import SaleEnvPage from "./page/SaleUrlPage";
import RegisterPage from "./page/RegisterPage";
import EnvironmentDetailPage from "./page/EnvironmentDetailPage";
import NotificationPage from "./page/NotificationPage";

import { AuthProvider } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import SellerHome from "./page/SellerHome";
import ErrorPage from "./page/ErrorPage";
import RedirectionPage from "./page/RedirectionPage";
import PublinkPage from "./page/PublinkPage";
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
            path="/publink"
            element={
              <Layout>
                <PublinkPage />
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

          <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
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
            <Route
              path="/notification"
              element={
                <Layout>
                  <NotificationPage />
                </Layout>
              }
            />
          </Route>

          <Route element={<ProtectedRoute allowedRoles={["SELLER"]} />}>
            <Route
              path="/sellerHome"
              element={
                <Layout>
                  <SellerHome />
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
