import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./page/LoginPage";
import ChangePasswordPage from "./page/ChangePasswordPage";
import AdminHomePage from "./page/AdminHomePage";
import GenerationPage from "./page/GenerationPage";
import SaleEnvPage from "./page/SaleUrlPage";
import RegisterPage from "./page/RegisterPage";
import EnvironmentDetailPage from "./page/EnvironmentDetailPage";
import NotificationPage from "./page/NotificationPage";
import AdminChatPage from "./page/AdminChatPage";
import SetupPage from "./page/SetupPage";
import SellerSetupPage from "./page/SellerSetupPage";
import PaymentPage from "./page/PaymentPage";
import BuyerSetupPage from "./page/BuyerSetupPage";

import { AuthProvider } from "./AuthContext";
import ProtectedRoute from "./ProtectedRoute";
import SellerHome from "./page/SellerHome";
import ErrorPage from "./page/ErrorPage";
import RedirectionPage from "./page/RedirectionPage";
import PublinkPage from "./page/PublinkPage";
import Layout from "./Layout";
import ChatNotifier from "./components/ChatNotifier";

function App() {
  return (
    <Router>
      <AuthProvider>
        {/* Lives outside the route tree on purpose: the unread badge in the
            header and the notification sound have to survive every navigation,
            including away from the chat page. */}
        <ChatNotifier />
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
            path="/change-password"
            element={
              <Layout>
                <ChangePasswordPage />
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
          {/* Public payment page: opened from the URL the admin sends */}
          <Route
            path="/payment"
            element={
              <Layout>
                <PaymentPage />
              </Layout>
            }
          />
          {/* Buyer / reset password setup page: opened from the emailed link */}
          <Route
            path="/buyer-setup"
            element={
              <Layout>
                <BuyerSetupPage />
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
            <Route
              path="/adminChat"
              element={
                <Layout>
                  <AdminChatPage />
                </Layout>
              }
            />
            <Route
              path="/setup"
              element={
                <Layout>
                  <SetupPage />
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
            <Route
              path="/sellerSetup"
              element={
                <Layout>
                  <SellerSetupPage />
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
