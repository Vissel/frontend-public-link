import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import CardWrapper from "../components/CardWrapper";
import PageContainer from "../components/PageContainer";
import api from "../api";
import JSEncrypt from "jsencrypt";

const normalizeRole = (role) =>
  String(role || "")
    .trim()
    .replace(/^ROLE_/i, "")
    .toLowerCase();

const LoginPage = () => {
  const [inputUsername, setInputUsername] = useState("");
  const [inputPassword, setInputPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login, logout } = useAuth();

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
        throw new Error("Pre-login got failure!");

      const encryptor = new JSEncrypt();
      encryptor.setPublicKey(publicKey);
      const encryptedPassword = encryptor.encrypt(inputPassword);

      const response = await api.post("/api/v1/auth/basic", {
        username: inputUsername,
        encryptedPassword: encryptedPassword,
      });

      if (response.status === 200) {
        const authData = login(response.data);
        if (!authData) {
          logout();
          setError("Login response is missing required authentication data.");
          return;
        }
        const primaryRole = normalizeRole(authData?.userRole);

        if (primaryRole === "admin") {
          navigate("/adminHome");
        } else {
          navigate("/sellerHome", {
            state: {
              username: authData?.username || inputUsername,
            },
          });
        }
      } else {
        logout();
        setError("You don't have permission to log in.");
      }
    } catch (err) {
      console.error("Login error:", err);
      if (err.response) {
        if (err.response.data && err.response.data.message) {
          setError(err.response.data.message);
        } else if (err.response.status === 401 || err.response.status === 403) {
          setError("Wrong username/password.");
        } else {
          setError("An unexpected error occurred during login.");
        }
      } else if (err.request) {
        setError(
          "No response from server. Please check your network connection."
        );
      } else {
        setError("Error setting up the login request.");
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
            <Typography variant="h3">Login</Typography>
            <Typography variant="body1" color="text.secondary">
              Sign in to manage seller onboarding and public order links.
            </Typography>
          </Stack>

          {error && <Alert severity="error">{error}</Alert>}

          <Box component="form" onSubmit={handleLogin}>
            <Stack spacing={2}>
              <TextField
                label="Username"
                type="text"
                value={inputUsername}
                onChange={(event) => setInputUsername(event.target.value)}
                required
              />
              <TextField
                label="Password"
                type="password"
                value={inputPassword}
                onChange={(event) => setInputPassword(event.target.value)}
                required
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={submitting}
              >
                Log in
              </Button>
            </Stack>
          </Box>
        </Stack>
      </CardWrapper>
    </PageContainer>
  );
};

export default LoginPage;
