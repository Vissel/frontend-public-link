import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import JSEncrypt from "jsencrypt";
import api from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";

const RegisterPage = () => {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const usernameParam = queryParams.get("username") || "";
  const reqUuidParam = queryParams.get("reqUuid") || "";
  const nameParam = queryParams.get("name") || "";

  const [inputUsername, setInputUsername] = useState(usernameParam);
  const [inputPassword, setInputPassword] = useState("");
  const [inputRepeatPassword, setInputRepeatPassword] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [inputName, setInputName] = useState(nameParam || usernameParam);
  const [inputLink, setInputLink] = useState("");
  const PUBLIC_LINK_CONTEXT = "/publiclink";

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    if (inputPassword !== inputRepeatPassword) {
      setPasswordMismatch(true);
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }
    setPasswordMismatch(false);

    try {
      if (inputUsername && inputPassword) {
        // Fetch the RSA public key (cached in sessionStorage to avoid repeated
        // round-trips, same strategy as LoginPage).
        let publicKey = sessionStorage.getItem("publicKey");
        if (publicKey === null) {
          const keyResponse = await api.get("/api/v1/auth/public-key", { responseType: "arraybuffer" });
          publicKey = new TextDecoder().decode(keyResponse.data);
          sessionStorage.setItem("publicKey", publicKey);
        }
        if (!publicKey) throw new Error("Failed to retrieve public key for encryption.");

        const encryptor = new JSEncrypt();
        encryptor.setPublicKey(publicKey);
        const encryptedPassword = encryptor.encrypt(inputPassword);
        if (!encryptedPassword) throw new Error("Password encryption failed.");

        const form = {
          username: inputUsername,
          password: encryptedPassword,
          repeatPassword: encryptedPassword,
          name: inputName,
          profileLink: inputLink,
          reqUuid: reqUuidParam,
        };

        const response = await api.post(`${PUBLIC_LINK_CONTEXT}/api/v1/publish/register`, form);

        if (response.status === 200) {
          console.log("Register successful!");
          // After successful registration, redirect to login page so the seller can authenticate
          navigate(`/login?username=${encodeURIComponent(inputUsername)}&requestUuid=${encodeURIComponent(reqUuidParam)}`);
        }
      }
    } catch (err) {
      console.error("Register error:", err);
      if (err.response) {
        if (err.response.data && err.response.data.message) {
          setError(err.response.data.message);
        } else if (err.response.status === 401 || err.response.status === 403) {
          setError("Registration failed. Please check your details.");
        } else {
          setError("An unexpected error occurred during registration.");
        }
      } else if (err.request) {
        setError(
          "No response from server. Please check your network connection."
        );
      } else {
        setError("Error setting up the register request.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasRequiredParams = Boolean(usernameParam && reqUuidParam);

  return (
    <PageContainer maxWidth="md">
      <SectionBlock
        title="Seller Registration"
        description="Set up your seller account to manage orders and public links."
      >
        <Stack spacing={3}>
          {!hasRequiredParams && (
            <Alert severity="error">
              Invalid registration link. Required parameters are missing.
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}

          <Box component="form" onSubmit={handleRegister}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Username"
                  type="text"
                  value={inputUsername}
                  required
                  disabled={Boolean(usernameParam)}
                  onChange={(event) => setInputUsername(event.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Password"
                  type="password"
                  value={inputPassword}
                  required
                  error={passwordMismatch}
                  onChange={(event) => {
                    setInputPassword(event.target.value);
                    if (inputRepeatPassword && event.target.value !== inputRepeatPassword) {
                      setPasswordMismatch(true);
                    } else {
                      setPasswordMismatch(false);
                    }
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Repeat Password"
                  type="password"
                  value={inputRepeatPassword}
                  required
                  error={passwordMismatch}
                  helperText={passwordMismatch ? "Passwords do not match" : ""}
                  onChange={(event) => {
                    setInputRepeatPassword(event.target.value);
                    setPasswordMismatch(inputPassword !== event.target.value);
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Name"
                  type="text"
                  value={inputName}
                  required
                  disabled={Boolean(nameParam)}
                  onChange={(event) => setInputName(event.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  label="Profile link (Facebook, Zalo, etc.)"
                  type="text"
                  value={inputLink}
                  onChange={(event) => setInputLink(event.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  justifyContent="space-between"
                  alignItems={{ xs: "stretch", sm: "center" }}
                >
                  <Typography variant="body2" color="text.secondary">
                    After successful registration, you will be redirected to the login page.
                  </Typography>
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={!hasRequiredParams || submitting || passwordMismatch}
                  >
                    Register
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Box>
        </Stack>
      </SectionBlock>
    </PageContainer>
  );
};

export default RegisterPage;
