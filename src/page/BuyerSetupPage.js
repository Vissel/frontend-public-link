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
import api, { pubApi } from "../api";
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
const MIN_PASSWORD_LENGTH = 8;

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
  const [tooShort, setTooShort] = useState(false);
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
    // The account service rejects anything under 8 characters, and it answers
    // with a 4xx that carries no body, so the rule is checked here first.
    if (password.length < MIN_PASSWORD_LENGTH) {
      setTooShort(true);
      setError(t("buyerSetup.errors.tooShort"));
      return;
    }
    setTooShort(false);
    if (password !== repeatPassword) {
      setMismatch(true);
      setError(t("buyerSetup.errors.mismatch"));
      return;
    }
    setMismatch(false);
    setSubmitting(true);
    try {
      // The RSA key lives on the gateway's permit-all /api/v1/auth/** route, so
      // it must go through `api` (gateway base). pubApi would prepend the
      // /publiclink context path, which the gateway treats as a protected
      // route and answers 401 to this logged-out setup page.
      let publicKey = sessionStorage.getItem("publicKey");
      if (!publicKey) {
        const keyResponse = await api.get("/api/v1/auth/public-key", { responseType: "arraybuffer" });
        publicKey = new TextDecoder().decode(keyResponse.data);
        // Never cache an empty body: a swallowed failure would otherwise be
        // reused for every later attempt on this page.
        if (publicKey) sessionStorage.setItem("publicKey", publicKey);
      }
      if (!publicKey) throw new Error(t("buyerSetup.errors.encryptFailed"));
      const encryptor = new JSEncrypt();
      encryptor.setPublicKey(publicKey);
      const encryptedPassword = encryptor.encrypt(password);
      if (!encryptedPassword) throw new Error(t("buyerSetup.errors.encryptFailed"));

      await pubApi.post("/api/v1/publish/yoga/setup/complete", { token, password: encryptedPassword });
      navigate("/login");
    } catch (err) {
      console.error("Setup failed", err);
      // Errors reach us as a status only: the response body is empty, so each
      // code is translated here instead of showing one generic failure.
      const status = err?.response?.status;
      setError(
        err?.response?.data?.errorMessage ||
        (status === 400
          ? t("buyerSetup.errors.tooShort")
          : status === 404
            ? t("buyerSetup.errors.accountMissing")
            : status === 502 || status === 503 || status === 504
              ? t("buyerSetup.errors.serviceUnreachable")
              : t("buyerSetup.errors.failed"))
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
                  error={tooShort}
                  helperText={tooShort ? t("buyerSetup.errors.tooShort") : t("buyerSetup.passwordHint")}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (tooShort) setTooShort(e.target.value.length < MIN_PASSWORD_LENGTH);
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
