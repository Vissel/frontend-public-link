import React, { useCallback, useEffect, useState } from "react";
import { Alert, Box, Chip, Stack, Typography } from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import CardWrapper from "../components/CardWrapper";
import PaymentInfoPanel from "../components/PaymentInfoPanel";
import { useTranslation } from "react-i18next";

/**
 * Public payment page opened from the URL the admin sends. No login needed:
 * the token in the query string is the only credential. It shows the plan,
 * the estimated activation window, the admin transfer accounts, and lets the
 * seller confirm the transfer - all of it rendered by PaymentInfoPanel, the
 * same component the self-service plan screen uses.
 */
const PaymentPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmed, setConfirmed] = useState(null);

  const load = useCallback(async () => {
    if (!token) {
      setError(t("payment.errors.missingToken"));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await pubApi.post("/api/v1/publish/payment/info", { token });
      setInfo(res.data || null);
    } catch (err) {
      console.error("Failed to load payment information", err);
      setError(
        err?.response?.data?.errorMessage ||
        err?.response?.data?.message ||
        t("payment.errors.load")
      );
    } finally {
      setLoading(false);
    }
  }, [t, token]);

  useEffect(() => {
    load();
  }, [load]);

  const status = confirmed?.status || info?.status;

  const renderStatus = () => {
    if (status === "CREATE") {
      return <Chip size="small" color="warning" label={t("payment.status.create")} />;
    }
    if (status === "WAITING_CONFIRM") {
      return (
        <Stack spacing={1} alignItems="flex-start">
          <Chip size="small" color="info" label={t("payment.status.waiting")} />
          <Typography variant="body2" color="text.secondary">
            {confirmed?.message || t("payment.waitingGuidance")}
          </Typography>
        </Stack>
      );
    }
    if (status === "PAID") {
      return <Chip size="small" color="success" label={t("payment.status.paid")} />;
    }
    if (status === "REJECTED") {
      return <Chip size="small" color="error" label={t("payment.status.rejected")} />;
    }
    return null;
  };

  const handleConfirmError = (err) => {
    setError(
      err?.response?.data?.errorMessage ||
      err?.response?.data?.message ||
      t("payment.errors.confirm")
    );
  };

  return (
    <PageContainer maxWidth="sm">
      <Stack spacing={3}>
        <CardWrapper>
          <Stack spacing={1.5}>
            <Typography variant="h4">{t("payment.title")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("payment.subtitle")}
            </Typography>
            {info && <Box sx={{ pt: 1 }}>{renderStatus()}</Box>}
          </Stack>
        </CardWrapper>

        {loading && <Alert severity="info">{t("common.loading")}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !info && !error && <Alert severity="warning">{t("payment.notFound")}</Alert>}

        {info && (
          <PaymentInfoPanel
            info={info}
            token={token}
            status={status}
            onConfirmed={setConfirmed}
            onError={handleConfirmError}
          />
        )}
      </Stack>
    </PageContainer>
  );
};

export default PaymentPage;
