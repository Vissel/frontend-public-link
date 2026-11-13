import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import JSEncrypt from "jsencrypt";
import { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import SectionBlock from "../components/SectionBlock";
import CardWrapper from "../components/CardWrapper";
import { useTranslation } from "react-i18next";

/**
 * Buyer (and reset) password setup page. Opened from the single-use link the
 * system emails / hands to the buyer after a seller payment plan is created
 * or an admin triggers a reset. Mirrors the seller register flow: the new
 * password is RSA-encrypted in the browser and only the setup token travels
 * as the credential.
 */
const BuyerSetupPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(t("buyerSetup.errors.invalidLink"));
      setLoading(false);
      return;
    }
    pubApi
      .post("/api/v1/publish/yoga/setup/info", { token })
      .then((response) => setInfo(response.data))
      .catch((err) => {
        setError(err?.response?.data?.errorMessage || t("buyerSetup.errors.invalidLink"));
      })
      .finally(() => setLoading(false));
  }, [token, t]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (password !== repeatPassword) {
      setMismatch(true);
      setError(t("buyerSetup.errors.mismatch"));
      return;
    }
    setMismatch(false);
    setSubmitting(true);
    try {
      let publicKey = sessionStorage.getItem("publicKey");
      if (publicKey === null) {
        const keyResponse = await pubApi.get("/api/v1/auth/public-key", { responseType: "arraybuffer" });
        publicKey = new TextDecoder().decode(keyResponse.data);
        sessionStorage.setItem("publicKey", publicKey);
      }
      const encryptor = new JSEncrypt();
      encryptor.setPublicKey(publicKey);
      const encryptedPassword = encryptor.encrypt(password);
      if (!encryptedPassword) throw new Error(t("buyerSetup.errors.encryptFailed"));

      await pubApi.post("/api/v1/publish/yoga/setup/complete", { token, password: encryptedPassword });
      navigate("/login");
    } catch (err) {
      console.error("Setup failed", err);
      setError(
        err?.response?.data?.errorMessage ||
        err?.response?.data?.message ||
        t("buyerSetup.errors.failed")
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageContainer maxWidth="sm">
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ py: 8 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">{t("common.loading")}</Typography>
        </Stack>
      </PageContainer>
    );
  }

  const invalid = info && !info.valid;

  return (
    <PageContainer maxWidth="sm">
      <SectionBlock
        title={info?.purpose === "RESET" ? t("buyerSetup.resetTitle") : t("buyerSetup.title")}
        description={t("buyerSetup.subtitle")}
      >
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}
          {invalid && <Alert severity="warning">{t("buyerSetup.errors.invalidOrExpired")}</Alert>}

          {info && (
            <CardWrapper>
              <Stack spacing={0.5}>
                <Typography variant="subtitle2">{info.username}</Typography>
                {info.fullName && info.fullName !== info.username && (
                  <Typography variant="body2" color="text.secondary">{info.fullName}</Typography>
                )}
                {info.expiresAt && (
                  <Typography variant="caption" color="text.secondary">
                    {t("buyerSetup.expiresAt")} {info.expiresAt}
                  </Typography>
                )}
              </Stack>
            </CardWrapper>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label={t("buyerSetup.newPassword")}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (repeatPassword) setMismatch(e.target.value !== repeatPassword);
                  }}
                  required
                  fullWidth
                  disabled={invalid}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label={t("buyerSetup.repeatPassword")}
                  type="password"
                  value={repeatPassword}
                  error={mismatch}
                  helperText={mismatch ? t("buyerSetup.errors.mismatch") : ""}
                  onChange={(e) => {
                    setRepeatPassword(e.target.value);
                    setMismatch(password !== e.target.value);
                  }}
                  required
                  fullWidth
                  disabled={invalid}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={submitting || invalid || !password || !repeatPassword}
                >
                  {submitting ? t("buyerSetup.saving") : t("buyerSetup.submit")}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </Stack>
      </SectionBlock>
    </PageContainer>
  );
};

export default BuyerSetupPage;
