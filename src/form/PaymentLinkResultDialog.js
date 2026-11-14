import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

/**
 * The "Next" dialog of the create-payment-plan flow. Success shows the payment
 * URL with a copy action so the admin can send it to the seller manually;
 * failure shows the server message.
 */
const PaymentLinkResultDialog = ({ open, onClose, result, errorMessage }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const paymentUrl = result?.paymentUrl || "";
  const createdPlan = result?.createdPlan || null;
  const absoluteUrl = React.useMemo(() => {
    if (!paymentUrl) return "";
    return /^https?:\/\//i.test(paymentUrl)
      ? paymentUrl
      : `${window.location.origin}${paymentUrl}`;
  }, [paymentUrl]);

  const dialogTitle = absoluteUrl
    ? t("paymentResult.successTitle")
    : createdPlan
      ? t("paymentResult.planCreatedTitle")
      : t("paymentResult.errorTitle");

  useEffect(() => {
    if (!open) {
      setCopied(false);
    }
  }, [open]);

  const handleCopy = () => {
    if (!absoluteUrl) return;
    const markCopied = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(absoluteUrl).then(markCopied).catch(markCopied);
      return;
    }
    const textArea = document.createElement("textarea");
    textArea.value = absoluteUrl;
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{dialogTitle}</DialogTitle>
      <DialogContent>
        {absoluteUrl ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {t("paymentResult.hint")}
            </Typography>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
                wordBreak: "break-all",
                bgcolor: "action.selected",
              }}
            >
              <Typography variant="body2" component="span">
                {absoluteUrl}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="small" onClick={handleCopy}>
                {copied ? t("common.copied") : t("common.copy")}
              </Button>
            </Stack>
          </Stack>
        ) : createdPlan ? (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              {t("paymentResult.planCreatedHint")}
            </Typography>
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {Number(createdPlan.fee || 0).toLocaleString("en-US")} VND
                {" | "}
                {createdPlan.planDay} {t("paymentResult.unit.day")}
                {" | "}
                {createdPlan.envCount} {t("paymentResult.unit.link")}
              </Typography>
              {createdPlan.description && (
                <Typography variant="caption" color="text.secondary">
                  {createdPlan.description}
                </Typography>
              )}
            </Box>
          </Stack>
        ) : (
          <Alert severity="error">
            {errorMessage || t("paymentResult.unknownError")}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("common.close")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default PaymentLinkResultDialog;
