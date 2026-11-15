import React, { useEffect, useState } from "react";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Link,
    Stack,
    Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";

const frontendOrigin = window.location.origin;

const addHostToHref = (link) => {
    if (!link) return "";
    return /^https?:\/\//i.test(link) ? link : `${frontendOrigin}${link}`;
};

const statusColor = (status) => {
    if (status === "PAID" || status === "CONFIRMED") return "success";
    if (status === "WAITING_CONFIRM") return "warning";
    if (status === "REJECTED") return "error";
    return "default";
};

/**
 * Answer to "Regenerate payment link": one fresh URL per selected plan, each
 * labelled with the seller it belongs to so the admin can paste the right one
 * into the right chat. Nothing is sent automatically.
 */
const PaymentLinksDialog = ({ open, onClose, items = [] }) => {
    const { t } = useTranslation();
    const [copiedKey, setCopiedKey] = useState("");

    useEffect(() => {
        if (!open) {
            setCopiedKey("");
        }
    }, [open]);

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
        } catch (err) {
            console.error("Copy failed", err);
        } finally {
            document.body.removeChild(textArea);
        }
    };

    const handleCopyText = (key, text) => {
        if (!text) return;
        const markCopied = () => {
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(""), 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(markCopied)
                .catch(() => fallbackCopy(text, markCopied));
            return;
        }
        fallbackCopy(text, markCopied);
    };

    const copyAll = () => {
        handleCopyText(
            "all",
            items.map((item) => `${item.username}: ${addHostToHref(item.paymentUrl)}`).join("\n")
        );
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{t("setup.links.title")}</DialogTitle>
            <DialogContent>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        {t("setup.links.hint")}
                    </Typography>

                    <Button size="small" variant="outlined" onClick={copyAll} sx={{ alignSelf: "flex-start" }}>
                        {copiedKey === "all" ? t("common.copied") : t("setup.links.copyAll")}
                    </Button>

                    {items.map((item, index) => {
                        const absoluteUrl = addHostToHref(item.paymentUrl);
                        return (
                            <Box key={item.planUserCode || index}>
                                {index > 0 && <Divider sx={{ mb: 2 }} />}
                                <Stack spacing={0.5}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="subtitle2">{item.username || "\u2014"}</Typography>
                                        <Chip
                                            size="small"
                                            label={item.paymentStatus || "\u2014"}
                                            color={statusColor(item.paymentStatus)}
                                            onClick={() => { }}
                                            clickable={false}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                                        {absoluteUrl || "\u2014"}
                                    </Typography>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Button
                                            size="small"
                                            variant="contained"
                                            disabled={!absoluteUrl}
                                            onClick={() => handleCopyText(`link-${item.planUserCode || index}`, absoluteUrl)}
                                            sx={{ minWidth: 60, fontSize: "0.7rem" }}
                                        >
                                            {copiedKey === `link-${item.planUserCode || index}`
                                                ? t("common.copied")
                                                : t("common.copy")}
                                        </Button>
                                        {absoluteUrl && (
                                            <Link
                                                href={absoluteUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                underline="hover"
                                                title={absoluteUrl}
                                            >
                                                {t("setup.links.open")}
                                            </Link>
                                        )}
                                    </Stack>
                                </Stack>
                            </Box>
                        );
                    })}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t("common.close")}</Button>
            </DialogActions>
        </Dialog>
    );
};

export default PaymentLinksDialog;
