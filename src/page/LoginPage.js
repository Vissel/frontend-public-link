import React, { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../AuthContext";
import CardWrapper from "../components/CardWrapper";
import PageContainer from "../components/PageContainer";
import api from "../api";
import JSEncrypt from "jsencrypt";
import { useTranslation } from "react-i18next";

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .replace(/^ROLE_/i, "")
    .toLowerCase();

const LoginPage = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const urlUsername = queryParams.get("username");
  const requestUuid = queryParams.get("requestUuid") || queryParams.get("reqUuid");
  const [inputUsername, setInputUsername] = useState(urlUsername || "");
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
        const authData = login(response.data);
        if (!authData) {
          logout();
          setError(t("login.errors.missingAuth"));
          return;
        }
        const primaryRole = normalizeRole(authData?.userRole);

        if (primaryRole === "admin") {
          navigate("/adminHome");
        } else {
          if (authData?.reqUuid) {
            navigate(`/api/v1/publish/saleUrl?requestUuid=${encodeURIComponent(authData.reqUuid)}`);
          } else {
            navigate("/sellerHome");
          }
        }
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
            </Stack>
          </Box>
        </Stack>
      </CardWrapper>
    </PageContainer>
  );
};

export default LoginPage;
