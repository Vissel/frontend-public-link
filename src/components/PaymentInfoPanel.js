import React, { useMemo, useState } from "react";
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
import { pubApi } from "../api";
import CardWrapper from "./CardWrapper";
import { copyText, formatVND, isDefaultTransfer } from "../util/clipboard";
import { useTranslation } from "react-i18next";

/**
 * Transfer instructions of one payment: the plan summary, the VietQR image, the
 * admin's receiving accounts and the "I have transferred" confirmation.
 *
 * Extracted from the public payment page so the self-service plan screen shows
 * the exact same thing a seller sees when an admin sends them a link - one
 * source for "how to pay", two ways to arrive at it.
 *
 * @param info           PaymentInfoResponse (plan, QR, transferInfos, status)
 * @param token          payment URL token, the only credential for confirming
 * @param status         overrides info.status once the seller confirmed
 * @param defaultEmail   prefill for the confirmation contact field
 * @param onConfirmed    receives the confirm response
 * @param onError        receives the error thrown by the confirm call
 */
const PaymentInfoPanel = ({ info, token, status, defaultEmail = "", onConfirmed, onError }) => {
    const { t } = useTranslation();
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [contact, setContact] = useState({ email: defaultEmail || "", phone: "" });
    const [confirming, setConfirming] = useState(false);
    const [copyKey, setCopyKey] = useState("");

    const effectiveStatus = status || info?.status;
    const canConfirm = Boolean(token) && effectiveStatus === "CREATE";

    const defaultTransfer = useMemo(
        () => (info?.transferInfos || []).find(isDefaultTransfer) || null,
        [info]
    );

    const handleCopy = (key, value) => {
        copyText(value, () => {
            setCopyKey(key);
            setTimeout(() => setCopyKey(""), 2000);
        });
    };

    const handleConfirm = async () => {
        try {
            setConfirming(true);
            const res = await pubApi.post("/api/v1/publish/payment/confirm", {
                token,
                email: contact.email.trim(),
                phone: contact.phone.trim(),
            });
            setConfirmOpen(false);
            if (onConfirmed) {
                onConfirmed(res.data || { status: "WAITING_CONFIRM" });
            }
        } catch (err) {
            console.error("Failed to confirm payment", err);
            if (onError) {
                onError(err);
            }
        } finally {
            setConfirming(false);
        }
    };

    if (!info) {
        return null;
    }

    return (
        <>
            <CardWrapper>
                <Stack spacing={1.5}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {t("payment.planTitle")}
                    </Typography>
                    {info.extendDays ? (
                        // This link does not sell a new plan, it buys days on the one the
                        // seller already has; say it before any number below.
                        <Alert severity="info" sx={{ py: 0.5 }}>
                            {t("payment.extendNotice", { days: info.extendDays })}
                        </Alert>
                    ) : null}
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
                            {info.extendDays
                                ? `${info.extendDays} ${t("payment.unit.day")}`
                                : `${info.planDay} ${t("payment.unit.day")} · ${info.envCount} ${t("payment.unit.link")}`}
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
                            {info.extendDays ? t("payment.field.extendFrom") : t("payment.field.estimatedActive")}
                        </Typography>
                        <Typography variant="body2">{info.estimatedActiveDate || "-"}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">
                            {info.extendDays ? t("payment.field.extendTo") : t("payment.field.estimatedEnd")}
                        </Typography>
                        <Typography variant="body2">{info.estimatedEndDate || "-"}</Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                        {info.extendDays ? t("payment.extendDateNote") : t("payment.dateNote")}
                    </Typography>
                </Stack>
            </CardWrapper>

            {info.qrUrl && (
                <CardWrapper>
                    <Stack spacing={1.5} alignItems="center">
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {t("payment.qrTitle")}
                        </Typography>
                        <Box
                            component="img"
                            src={info.qrUrl}
                            alt={t("payment.qrTitle")}
                            sx={{ width: 260, height: 260, objectFit: "contain" }}
                        />
                        {info.qrAddInfo && (
                            <Typography variant="caption" color="text.secondary">
                                {t("payment.qrContent")}: {info.qrAddInfo}
                            </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary" align="center">
                            {t("payment.qrHint")}
                        </Typography>
                    </Stack>
                </CardWrapper>
            )}

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
                                borderColor: isDefaultTransfer(transfer) ? "primary.main" : "divider",
                            }}
                        >
                            <Stack spacing={1.5}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {transfer.transferIssuer}
                                    </Typography>
                                    {isDefaultTransfer(transfer) && (
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
                                        onClick={() => handleCopy(`acc-${transfer.transferNumber}`, transfer.transferNumber)}
                                    >
                                        {copyKey === `acc-${transfer.transferNumber}` ? t("common.copied") : t("common.copy")}
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
                    <Button variant="contained" disabled={!canConfirm} onClick={() => setConfirmOpen(true)}>
                        {effectiveStatus === "CREATE" ? t("payment.confirmButton") : t("payment.processed")}
                    </Button>
                </Stack>
            </CardWrapper>

            <Dialog
                open={confirmOpen}
                onClose={confirming ? undefined : () => setConfirmOpen(false)}
                fullWidth
                maxWidth="xs"
            >
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
        </>
    );
};

export default PaymentInfoPanel;
