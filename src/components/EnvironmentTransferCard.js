import React, { useEffect, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Link,
    List,
    ListItemButton,
    ListItemText,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { pubApi } from "../api";
import { loadVietnameseBanks } from "../util/vnBanks";

const CopyIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const QrIcon = ({ size = 22 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1" />
    </svg>
);

const fallbackCopy = (text, onDone) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand("copy");
        onDone();
    } catch (e) {
        console.error("Copy failed", e);
    } finally {
        document.body.removeChild(textArea);
    }
};

/**
 * The transfer account a sale page shows so buyers can pay. Rendered as a
 * full-width band: QR on the left (click to enlarge), bank / number / name
 * filling the middle, manage actions top-right. The seller - or an admin with
 * the admin's own accounts - attaches, changes or removes it; "Add" picks the
 * owner's default account straight away, "Change" opens the picker.
 */
const EnvironmentTransferCard = ({ transferInfo, canManage, mode, requestUuid, onChanged, compact = false }) => {
    const { t } = useTranslation();
    const [zoomOpen, setZoomOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [selectedCode, setSelectedCode] = useState("");
    const [banks, setBanks] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const isAdmin = mode === "admin";
    const updatePath = isAdmin
        ? "/admin/v1/environment/transferInfo"
        : "/api/v1/seller/environment/transferInfo";
    // Sellers manage their transfer accounts on their own account page now.
    const setupPath = isAdmin ? "/setup" : "/self";

    useEffect(() => {
        if (!transferInfo && !canManage) return;
        loadVietnameseBanks()
            .then(setBanks)
            .catch((err) => console.error("Failed to load bank directory", err));
    }, [transferInfo, canManage]);

    if (!transferInfo && !canManage) {
        return null;
    }

    const logo = banks.find(
        (bank) => (bank.shortName || "").toLowerCase() === (transferInfo?.transferIssuer || "").toLowerCase()
    )?.logo;

    const handleCopy = () => {
        const text = transferInfo?.transferNumber;
        if (!text) return;
        const markCopied = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(markCopied)
                .catch(() => fallbackCopy(text, markCopied));
        } else {
            fallbackCopy(text, markCopied);
        }
    };

    const loadAccounts = async () => {
        const res = await pubApi.get("/api/v1/transferInfo/list");
        const items = res.data?.items || [];
        setAccounts(items);
        return items;
    };

    const save = async (transferCode) => {
        setBusy(true);
        setError("");
        try {
            await pubApi.post(updatePath, { requestUuid, transferCode: transferCode || "" });
            setPickerOpen(false);
            if (onChanged) await onChanged();
        } catch (err) {
            console.error("Failed to update environment transfer account", err);
            setError(err?.response?.data?.errorMessage || err?.response?.data?.message || t("publink.transfer.errors.save"));
        } finally {
            setBusy(false);
        }
    };

    // The default account is attached without a dialog; the picker only
    // appears when there is nothing to attach or a different account is wanted.
    const handleAdd = async () => {
        setBusy(true);
        setError("");
        try {
            const items = await loadAccounts();
            const preferred = items.find((item) => item.isDefault) || items[0];
            if (preferred) {
                setBusy(false);
                await save(preferred.transferCode);
                return;
            }
            setSelectedCode("");
            setPickerOpen(true);
        } catch (err) {
            console.error("Failed to load transfer accounts", err);
            setError(t("publink.transfer.errors.load"));
        } finally {
            setBusy(false);
        }
    };

    const handleChange = async () => {
        setBusy(true);
        setError("");
        try {
            await loadAccounts();
            setSelectedCode(transferInfo?.transferCode || "");
            setPickerOpen(true);
        } catch (err) {
            console.error("Failed to load transfer accounts", err);
            setError(t("publink.transfer.errors.load"));
        } finally {
            setBusy(false);
        }
    };

    const manageActions = canManage && transferInfo && (
        <Stack direction="row" spacing={1}>
            <Button size="small" variant="outlined" onClick={handleChange} disabled={busy}>
                {t("publink.transfer.change")}
            </Button>
            <Button size="small" color="error" onClick={() => save("")} disabled={busy}>
                {t("publink.transfer.remove")}
            </Button>
        </Stack>
    );

    return (
        <Box
            sx={{
                border: "1px solid",
                borderColor: (theme) => alpha(theme.palette.primary.main, 0.18),
                borderRadius: compact ? 2 : 3,
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
                // Compact mode is the narrow right-hand slot of the sale-space
                // header: just enough padding and QR size to read, no slack.
                p: compact ? 1.5 : { xs: 2, sm: 2.5 },
            }}
        >
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                    {error}
                </Alert>
            )}

            {transferInfo ? (
                <Stack spacing={compact ? 1.5 : 2}>
                    <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        justifyContent="space-between"
                        flexWrap="wrap"
                        useFlexGap
                    >
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: "primary.main" }}>
                            <QrIcon size={18} />
                            <Typography variant="subtitle2">{t("publink.transfer.title")}</Typography>
                        </Stack>
                        {manageActions}
                    </Stack>

                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={compact ? 1.5 : { xs: 2, sm: 3 }}
                        alignItems={compact ? "flex-start" : { xs: "center", sm: "center" }}
                    >
                        {/* White tile hugs the image's own aspect so a portrait
                            VietQR card is not letterboxed inside a square. */}
                        <Stack spacing={0.75} alignItems="center" sx={{ flexShrink: 0 }}>
                            <Box
                                sx={{
                                    bgcolor: "background.paper",
                                    border: "1px solid",
                                    borderColor: "divider",
                                    borderRadius: 2,
                                    p: compact ? 0.75 : 1,
                                    boxShadow: "0 8px 24px rgba(15, 76, 129, 0.10)",
                                    cursor: "zoom-in",
                                    lineHeight: 0,
                                }}
                                onClick={() => setZoomOpen(true)}
                                title={t("publink.transfer.zoomHint")}
                            >
                                {transferInfo.qrImage ? (
                                    <Box
                                        component="img"
                                        src={transferInfo.qrImage}
                                        alt="transfer qr"
                                        sx={{
                                            height: compact ? { xs: 110, sm: 120 } : { xs: 180, sm: 210 },
                                            width: "auto",
                                            maxWidth: "100%",
                                            objectFit: "contain",
                                            display: "block",
                                        }}
                                    />
                                ) : (
                                    <Stack
                                        alignItems="center"
                                        justifyContent="center"
                                        sx={{ width: 180, height: 180, color: "text.secondary" }}
                                    >
                                        <QrIcon size={40} />
                                    </Stack>
                                )}
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                                {transferInfo.qrImage ? t("publink.transfer.zoomHint") : t("publink.transfer.noQr")}
                            </Typography>
                        </Stack>

                        <Stack spacing={compact ? 1 : 1.25} sx={{ flexGrow: 1, minWidth: 0, width: "100%" }}>
                            <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                                {logo && (
                                    <Box
                                        component="img"
                                        src={logo}
                                        alt=""
                                        sx={{ height: compact ? 20 : 28, width: "auto", maxWidth: 96, objectFit: "contain" }}
                                    />
                                )}
                                <Typography variant={compact ? "subtitle2" : "subtitle1"}>{transferInfo.transferIssuer}</Typography>
                                <Chip
                                    size="small"
                                    variant="outlined"
                                    label={t(`transferInfo.types.${(transferInfo.type || "BANK").toLowerCase()}`)}
                                />
                            </Stack>

                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography
                                    variant={compact ? "h6" : "h4"}
                                    sx={{ letterSpacing: compact ? 0.5 : 1, fontVariantNumeric: "tabular-nums", wordBreak: "break-all" }}
                                >
                                    {transferInfo.transferNumber}
                                </Typography>
                                <Tooltip title={t("publink.transfer.copyNumber")}>
                                    <IconButton size="small" onClick={handleCopy} sx={{ color: "primary.main" }}>
                                        <CopyIcon />
                                    </IconButton>
                                </Tooltip>
                                {copied && (
                                    <Chip size="small" color="success" label={t("common.copied")} />
                                )}
                            </Stack>

                            {transferInfo.accountName && (
                                <Typography variant={compact ? "body2" : "body1"} sx={{ fontWeight: 600 }}>
                                    {transferInfo.accountName}
                                </Typography>
                            )}
                            {/* The bank's full legal name and the scan hint are
                                the first things to go in the narrow slot: the
                                issuer line and the QR already say both. */}
                            {!compact && transferInfo.issuerFullName && (
                                <Typography variant="caption" color="text.secondary">
                                    {transferInfo.issuerFullName}
                                </Typography>
                            )}

                            {transferInfo.defaultMessage && (
                                <Box
                                    sx={{
                                        alignSelf: { xs: "stretch", sm: "flex-start" },
                                        bgcolor: (theme) => alpha(theme.palette.success.main, 0.08),
                                        border: "1px solid",
                                        borderColor: (theme) => alpha(theme.palette.success.main, 0.25),
                                        borderRadius: 2,
                                        px: compact ? 1.25 : 1.5,
                                        py: compact ? 0.75 : 1,
                                    }}
                                >
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        {t("publink.transfer.contentLabel")}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                        {transferInfo.defaultMessage}
                                    </Typography>
                                </Box>
                            )}

                            {!compact && (
                                <Typography variant="caption" color="text.secondary">
                                    {t("publink.transfer.scanHint")}
                                </Typography>
                            )}
                        </Stack>
                    </Stack>
                </Stack>
            ) : (
                /* Nothing attached yet: a full-width call to action instead of
                   an empty corner, so the seller sees what buyers will get. */
                <Stack
                    direction={compact ? "column" : { xs: "column", sm: "row" }}
                    spacing={compact ? 1 : 2}
                    alignItems="center"
                    sx={{
                        border: "1px dashed",
                        borderColor: (theme) => alpha(theme.palette.primary.main, 0.35),
                        borderRadius: 2,
                        px: compact ? 1.5 : 2,
                        py: compact ? 1.5 : 2,
                    }}
                >
                    <Box
                        sx={{
                            width: compact ? 32 : 44,
                            height: compact ? 32 : 44,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.10),
                            color: "primary.main",
                            flexShrink: 0,
                        }}
                    >
                        <QrIcon size={compact ? 18 : 22} />
                    </Box>
                    <Stack spacing={0.25} sx={{ flexGrow: 1, minWidth: 0, textAlign: { xs: "center", sm: "left" } }}>
                        <Typography variant={compact ? "body2" : "subtitle2"}>{t("publink.transfer.emptyTitle")}</Typography>
                        <Typography variant={compact ? "caption" : "body2"} color="text.secondary">
                            {t("publink.transfer.emptyDesc")}
                        </Typography>
                    </Stack>
                    <Button variant="contained" size={compact ? "small" : "medium"} onClick={handleAdd} disabled={busy} sx={{ flexShrink: 0 }}>
                        {t("publink.transfer.add")}
                    </Button>
                </Stack>
            )}

            {/* Enlarged QR so another phone can scan it from the screen. */}
            <Dialog open={zoomOpen} onClose={() => setZoomOpen(false)} maxWidth="xs">
                <DialogTitle sx={{ pb: 1 }}>{t("publink.transfer.qrDialogTitle")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={1.5} alignItems="center">
                        <Box
                            component="img"
                            src={transferInfo?.qrImage}
                            alt="transfer qr"
                            sx={{
                                height: "min(62vh, 440px)",
                                width: "auto",
                                maxWidth: "100%",
                                objectFit: "contain",
                            }}
                        />
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="h5" sx={{ letterSpacing: 1 }}>
                                {transferInfo?.transferNumber}
                            </Typography>
                            <Tooltip title={t("publink.transfer.copyNumber")}>
                                <IconButton size="small" onClick={handleCopy} sx={{ color: "primary.main" }}>
                                    <CopyIcon />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                        {transferInfo?.accountName && (
                            <Typography variant="body2" color="text.secondary">
                                {transferInfo.accountName}
                            </Typography>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setZoomOpen(false)}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>

            {/* Picker: the owner's active accounts, default first. */}
            <Dialog open={pickerOpen} onClose={() => !busy && setPickerOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ pb: 1 }}>{t("publink.transfer.pickTitle")}</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        {t("publink.transfer.pickDesc")}
                    </Typography>
                    {accounts.length === 0 ? (
                        <Alert severity="info">
                            {t("publink.transfer.noAccounts")}{" "}
                            <Link component={RouterLink} to={setupPath}>
                                {t("publink.transfer.goSetup")}
                            </Link>
                        </Alert>
                    ) : (
                        <List dense disablePadding>
                            {accounts.map((item) => (
                                <ListItemButton
                                    key={item.transferCode}
                                    selected={selectedCode === item.transferCode}
                                    onClick={() => setSelectedCode(item.transferCode)}
                                    sx={{ borderRadius: 1 }}
                                >
                                    <ListItemText
                                        primary={
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {item.transferIssuer}
                                                </Typography>
                                                <Typography variant="body2">{item.transferNumber}</Typography>
                                                {item.isDefault && (
                                                    <Chip size="small" color="primary" label={t("transferInfo.chip.default")} />
                                                )}
                                            </Stack>
                                        }
                                        secondary={item.accountName || null}
                                    />
                                </ListItemButton>
                            ))}
                        </List>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPickerOpen(false)} disabled={busy}>
                        {t("common.cancel")}
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => save(selectedCode)}
                        disabled={busy || !selectedCode || selectedCode === transferInfo?.transferCode}
                    >
                        {t("common.save")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default EnvironmentTransferCard;
