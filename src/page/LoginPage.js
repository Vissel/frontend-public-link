import React, { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Link as RouterLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import CardWrapper from "../components/CardWrapper";
import PageContainer from "../components/PageContainer";
import api, { pubApi } from "../api";
import JSEncrypt from "jsencrypt";
import { useTranslation } from "react-i18next";

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .replace(/^ROLE_/i, "")
    .toLowerCase();

/**
 * Only in-app paths are honoured as a post-login target, so a "?next=" can
 * never be turned into an open redirect.
 */
const isInternalPath = (path) =>
  typeof path === "string" && path.startsWith("/") && !path.startsWith("//");

const LoginPage = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const urlUsername = queryParams.get("username");
  // Set by ProtectedRoute when a valid session is rejected by a role guard:
  // the seller paid and set a password, but the account is not a seller yet.
  const deniedRole = location.state?.deniedRole || "";
  // Set by the self-register screen: the account is brand new, so say so and
  // carry the typed username instead of putting it in the address bar.
  const justRegistered = Boolean(location.state?.accountCreated);
  const nextParam = queryParams.get("next") || location.state?.next || "";
  const requestUuid = queryParams.get("requestUuid") || queryParams.get("reqUuid");
  const [inputUsername, setInputUsername] = useState(
    urlUsername || location.state?.username || ""
  );
  const [inputPassword, setInputPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login, logout } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    if (urlUsername) {
      setInputUsername(urlUsername);
    }
  }, [urlUsername]);

  /**
   * A seller with no usable plan cannot create a product link, so the
   * workspace would look empty. The plan screen is the honest destination.
   * A failed check must not lock anyone out of their own workspace.
   */
  const hasUsablePlan = async () => {
    try {
      const response = await pubApi.post("/api/v1/sellerPlan/check");
      return Boolean(response.data?.allowed);
    } catch (err) {
      console.error("Failed to check the payment plan", err);
      return true;
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      let publicKey = sessionStorage.getItem("publicKey");
      if (publicKey === null) {
        const keyResponse = await api.get("/api/v1/auth/public-key", { responseType: "arraybuffer" });
        publicKey = new TextDecoder().decode(keyResponse.data);
        sessionStorage.setItem("publicKey", publicKey);
      }
      if (!publicKey || !inputUsername || !inputPassword)
        throw new Error(t("login.errors.preLogin"));

      const encryptor = new JSEncrypt();
      encryptor.setPublicKey(publicKey);
      const encryptedPassword = encryptor.encrypt(inputPassword);

      const response = await api.post("/api/v1/auth/basic", {
        username: inputUsername,
        encryptedPassword: encryptedPassword,
        ...(requestUuid && { reqUuid: requestUuid }),
      });

      if (response.status === 200) {
        if (response.data?.changePasswordRequired) {
          navigate(
            `/change-password?ticket=${encodeURIComponent(
              response.data.passwordChangeTicket || ""
            )}`
          );
          return;
        }
        const authData = login(response.data);
        if (!authData) {
          logout();
          setError(t("login.errors.missingAuth"));
          return;
        }
        const primaryRole = normalizeRole(authData?.userRole);

        if (primaryRole === "admin") {
          navigate("/adminHome");
          return;
        }
        if (authData?.reqUuid) {
          navigate(`/api/v1/publish/saleUrl?requestUuid=${encodeURIComponent(authData.reqUuid)}`);
          return;
        }
        if (isInternalPath(nextParam)) {
          navigate(nextParam);
          return;
        }
        // Only sellers have a workspace. Any other role - a buyer created for a
        // yoga plan, for instance - would be bounced back to this form by the
        // seller route guard, so land them on the plan screen instead, which
        // every non-admin account may open and which is where they can buy.
        if (primaryRole !== "seller") {
          navigate("/morePlan");
          return;
        }
        navigate((await hasUsablePlan()) ? "/sellerHome" : "/plans");
      } else {
        logout();
        setError(t("login.errors.noPermission"));
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err.response) {
        if (err.response.data && err.response.data.message) {
          setError(err.response.data.message);
        } else if (err.response.status === 401 || err.response.status === 403) {
          setError(t("login.errors.wrongCredentials"));
        } else {
          setError(t("login.errors.unexpected"));
        }
      } else if (err.request) {
        setError(t("login.errors.noResponse"));
      } else {
        setError(t("login.errors.setupError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer
      maxWidth="sm"
      sx={{
        display: "flex",
        alignItems: "center",
        minHeight: { xs: "calc(100dvh - 180px)", md: "calc(100dvh - 200px)" },
      }}
    >
      <CardWrapper sx={{ width: "100%" }}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant="h3">{t("login.title")}</Typography>
            <Typography variant="body1" color="text.secondary">
              {t("login.subtitle")}
            </Typography>
          </Stack>

          {deniedRole && (
            <Alert severity="warning">
              {t("login.errors.noWorkspace", { role: deniedRole })}
            </Alert>
          )}
          {justRegistered && (
            <Alert severity="success">{t("login.registeredNote")}</Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}

          <Box component="form" onSubmit={handleLogin}>
            <Stack spacing={2}>
              <TextField
                label={t("login.username")}
                type="text"
                value={inputUsername}
                disabled={Boolean(urlUsername)}
                onChange={(event) => setInputUsername(event.target.value)}
                required
              />
              <TextField
                label={t("login.password")}
                type="password"
                value={inputPassword}
                onChange={(event) => setInputPassword(event.target.value)}
                required
              />
              {requestUuid && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontStyle: "italic" }}
                >
                  {t("login.requestId")}: {requestUuid}
                </Typography>
              )}
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
              >
                {t("login.loginButton")}
              </Button>
              <Typography variant="body2" align="center" color="text.secondary">
                {t("login.noAccount")}{" "}
                <Link component={RouterLink} to="/register">
                  {t("login.registerLink")}
                </Link>
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </CardWrapper>
    </PageContainer>
  );
};

export default LoginPage;
