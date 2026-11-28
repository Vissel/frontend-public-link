import { useEffect, useState } from "react";
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Stack,
    Tooltip,
    Typography,
} from "@mui/material";
import QRCode from "qrcode";
import { useTranslation } from "react-i18next";

const QrIcon = ({ size = 18 }) => (
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
    textArea.style.opacity = 0;
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
 * QR trigger + dialog for a sale-environment share link.
 *
 * Scanning the code opens the buyer-facing product page
 * (`<origin>/publink?token=...`), so a seller can hand the space to a buyer
 * without copying a long JWT into a chat. The PNG is generated client-side
 * from the absolute URL the page already builds for its copy-link action,
 * which keeps QA and production hosts correct without extra config.
 */
const ShareLinkQrButton = ({ url }) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [dataUrl, setDataUrl] = useState("");
    const [failed, setFailed] = useState(false);
    const [copied, setCopied] = useState(false);

    // Generate on open only: tables can hold dozens of rows and encoding a
    // QR per row up front would stall the first paint for nothing.
    useEffect(() => {
        if (!open || !url) return undefined;
        let cancelled = false;
        setDataUrl("");
        setFailed(false);
        QRCode.toDataURL(url, { width: 480, margin: 1, errorCorrectionLevel: "M" })
            .then((png) => {
                if (!cancelled) setDataUrl(png);
            })
            .catch((err) => {
                console.error("QR generation failed", err);
                if (!cancelled) setFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [open, url]);

    const handleCopy = () => {
        if (!url) return;
        const markCopied = () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(url)
                .then(markCopied)
                .catch(() => fallbackCopy(url, markCopied));
        } else {
            fallbackCopy(url, markCopied);
        }
    };

    return (
        <>
            <Tooltip title={t("shareQr.tooltip")}>
                <IconButton
                    size="small"
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpen(true);
                    }}
                    sx={{ color: "primary.main" }}
                >
                    <QrIcon />
                </IconButton>
            </Tooltip>
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t("shareQr.title")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={1.5} alignItems="center" sx={{ pt: 0.5 }}>
                        <Box
                            sx={{
                                p: 1.5,
                                minHeight: 248,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                bgcolor: "background.paper",
                                border: "1px solid",
                                borderColor: "divider",
                                borderRadius: 2,
                                lineHeight: 0,
                            }}
                        >
                            {failed ? (
                                <Alert severity="error">{t("shareQr.error")}</Alert>
                            ) : dataUrl ? (
                                <Box
                                    component="img"
                                    src={dataUrl}
                                    alt={t("shareQr.title")}
                                    sx={{ width: 216, height: 216 }}
                                />
                            ) : (
                                <CircularProgress size={28} />
                            )}
                        </Box>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            align="center"
                            sx={{ wordBreak: "break-all" }}
                        >
                            {url}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" align="center">
                            {t("shareQr.hint")}
                        </Typography>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCopy} disabled={!url}>
                        {copied ? t("common.copied") : t("common.copy")}
                    </Button>
                    <Button onClick={() => setOpen(false)}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default ShareLinkQrButton;
