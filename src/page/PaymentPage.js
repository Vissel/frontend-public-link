import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { pubApi } from "../api";
import PageContainer from "../components/PageContainer";
import CardWrapper from "../components/CardWrapper";
import { useTranslation } from "react-i18next";

const contextPath = "/publiclink";

const formatVND = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString("en-US");
};

/**
 * Public payment page opened from the URL the admin sends. No login needed:
 * the token in the query string is the only credential. It shows the plan,
 * the estimated activation window, the admin transfer accounts, and lets the
 * seller confirm the transfer.
 */
const PaymentPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [contact, setContact] = useState({ email: "", phone: "" });
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [copiedKey, setCopiedKey] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError(t("payment.errors.missingToken"));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await pubApi.post(`${contextPath}/api/v1/publish/payment/info`, { token });
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
  const canConfirm = !loading && status === "CREATE";

  const defaultTransfer = useMemo(
    () => (info?.transferInfos || []).find((item) => item.isDefault) || null,
    [info]
  );

  const handleCopy = (key, value) => {
    if (!value) return;
    const markCopied = () => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(""), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(markCopied).catch(markCopied);
      return;
    }
    const textArea = document.createElement("textarea");
    textArea.value = value;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Copy failed", err);
    } finally {
      document.body.removeChild(textArea);
      markCopied();
    }
  };

  const handleConfirm = async () => {
    setError("");
    try {
      setConfirming(true);
      const res = await pubApi.post(`${contextPath}/api/v1/publish/payment/confirm`, {
        token,
        email: contact.email.trim(),
        phone: contact.phone.trim(),
      });
      setConfirmed(res.data || { status: "WAITING_CONFIRM" });
      setConfirmOpen(false);
    } catch (err) {
      console.error("Failed to confirm payment", err);
      setError(
        err?.response?.data?.errorMessage ||
        err?.response?.data?.message ||
        t("payment.errors.confirm")
      );
    } finally {
      setConfirming(false);
    }
  };

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

        {loading && (
          <Alert severity="info">{t("common.loading")}</Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !info && !error && <Alert severity="warning">{t("payment.notFound")}</Alert>}

        {info && (
          <>
            <CardWrapper>
              <Stack spacing={1.5}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t("payment.planTitle")}
                </Typography>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    {t("payment.field.fee")}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatVND(info.fee)} VND
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    {t("payment.field.duration")}
                  </Typography>
                  <Typography variant="body2">
                    {info.planDay} {t("payment.unit.day")} · {info.envCount} {t("payment.unit.link")}
                  </Typography>
                </Stack>
                {info.description && (
                  <Typography variant="body2" color="text.secondary">
                    {info.description}
                  </Typography>
                )}
                <Divider />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    {t("payment.field.estimatedActive")}
                  </Typography>
                  <Typography variant="body2">{info.estimatedActiveDate || "-"}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    {t("payment.field.estimatedEnd")}
                  </Typography>
                  <Typography variant="body2">{info.estimatedEndDate || "-"}</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {t("payment.dateNote")}
                </Typography>
              </Stack>
            </CardWrapper>

            <CardWrapper>
              <Stack spacing={2}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {t("payment.transferTitle")}
                </Typography>
                {(info.transferInfos || []).length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {t("payment.noTransfer")}
                  </Typography>
                )}
                {(info.transferInfos || []).map((transfer, index) => (
                  <Box
                    key={`${transfer.transferNumber}-${index}`}
                    sx={{
                      p: 2,
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: transfer.isDefault ? "primary.main" : "divider",
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {transfer.transferIssuer}
                        </Typography>
                        {transfer.isDefault && (
                          <Chip size="small" color="primary" label={t("transferInfo.chip.default")} />
                        )}
                      </Stack>
                      {transfer.issuerFullName && (
                        <Typography variant="caption" color="text.secondary">
                          {transfer.issuerFullName}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="body2">
                          {t("payment.field.accountNumber")}: {transfer.transferNumber}
                        </Typography>
                        <Button
                          size="small"
                          onClick={() =>
                            handleCopy(`acc-${transfer.transferNumber}`, transfer.transferNumber)
                          }
                        >
                          {copiedKey === `acc-${transfer.transferNumber}`
                            ? t("common.copied")
                            : t("common.copy")}
                        </Button>
                      </Stack>
                      <Typography variant="body2">
                        {t("payment.field.accountName")}: {transfer.accountName || "-"}
                      </Typography>
                      {transfer.qrImage && (
                        <Box
                          component="img"
                          src={transfer.qrImage}
                          alt="payment qr"
                          sx={{ width: 220, height: 220, objectFit: "contain", alignSelf: "center" }}
                        />
                      )}
                      {transfer.defaultMessage && (
                        <Alert severity="info" sx={{ fontSize: 13 }}>
                          {t("payment.scanMessagePrefix")} {transfer.defaultMessage}
                        </Alert>
                      )}
                    </Stack>
                  </Box>
                ))}
                {defaultTransfer?.defaultMessage && (
                  <Typography variant="caption" color="text.secondary">
                    {t("payment.transferNote")}
                  </Typography>
                )}
              </Stack>
            </CardWrapper>

            <CardWrapper>
              <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary">
                  {t("payment.guide")}
                </Typography>
                <Button
                  variant="contained"
                  disabled={!canConfirm}
                  onClick={() => setConfirmOpen(true)}
                >
                  {status === "CREATE" ? t("payment.confirmButton") : t("payment.processed")}
                </Button>
              </Stack>
            </CardWrapper>
          </>
        )}
      </Stack>

      <Dialog open={confirmOpen} onClose={confirming ? undefined : () => setConfirmOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{t("payment.confirmTitle")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t("payment.confirmSubtitle")}
            </Typography>
            <TextField
              size="small"
              label={t("payment.field.email")}
              value={contact.email}
              onChange={(event) => setContact((prev) => ({ ...prev, email: event.target.value }))}
            />
            <TextField
              size="small"
              label={t("payment.field.phone")}
              value={contact.phone}
              onChange={(event) => setContact((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={confirming}>
            {t("common.cancel")}
          </Button>
          <Button variant="contained" onClick={handleConfirm} disabled={confirming}>
            {t("common.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </PageContainer>
  );
};

export default PaymentPage;
