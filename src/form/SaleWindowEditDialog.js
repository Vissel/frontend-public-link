import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { pubApi } from "../api";
import { formatDateTime, fromInputValue, parsePlanDate, toInputValue } from "../util/planWindow";

/**
 * Seller edit of an existing sale window: the closing time may be moved
 * earlier, or the sale closed immediately.
 *
 * Moving it later is refused on purpose (client and server): the public link
 * token was minted to expire at the original end, so a later value would
 * promise validity the token cannot deliver. Shortening can therefore never
 * push the window past the paid plan end either.
 */
const SaleWindowEditDialog = ({ open, environment, onClose, onSaved }) => {
    const { t } = useTranslation();
    const [endValue, setEndValue] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const currentEnd = useMemo(
        () => parsePlanDate(environment?.plannedEndedAt),
        [environment?.plannedEndedAt]
    );
    const currentStart = useMemo(
        () => parsePlanDate(environment?.plannedStartedAt),
        [environment?.plannedStartedAt]
    );

    useEffect(() => {
        if (!open) {
            return;
        }
        setError("");
        setSubmitting(false);
        setEndValue(currentEnd ? toInputValue(currentEnd) : "");
    }, [open, currentEnd]);

    const submit = async (endAt) => {
        setError("");
        setSubmitting(true);
        try {
            await pubApi.post("/api/v1/seller/environment/updateWindow", {
                requestUuid: environment?.requestUUID,
                endAt,
            });
            onSaved?.();
            onClose?.();
        } catch (err) {
            console.error("Failed to update sale window", err);
            setError(err?.response?.data?.errorMessage || t("saleWindow.errors.update"));
        } finally {
            setSubmitting(false);
        }
    };

    const handleSave = () => {
        const end = fromInputValue(endValue);
        if (!end) {
            setError(t("saleWindow.errors.required"));
            return;
        }
        if (currentEnd && end.getTime() > currentEnd.getTime()) {
            setError(
                t("saleWindow.errors.cannotExtend", { planEnd: formatDateTime(currentEnd) })
            );
            return;
        }
        submit(end.getTime());
    };

    return (
        <Dialog
            open={open}
            onClose={submitting ? undefined : onClose}
            fullWidth
            maxWidth="sm"
            PaperProps={{ sx: { borderRadius: 1 } }}
        >
            <DialogTitle>{t("saleWindow.editTitle")}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ pt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}

                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {environment?.productName || "\u2014"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t("saleWindow.currentStart")}:{" "}
                        {currentStart ? formatDateTime(currentStart) : t("saleWindow.startedOnCreate")}
                        {" · "}
                        {t("saleWindow.currentEnd")}:{" "}
                        {currentEnd ? formatDateTime(currentEnd) : "\u2014"}
                    </Typography>

                    <TextField
                        fullWidth
                        size="small"
                        type="datetime-local"
                        label={t("saleWindow.newEnd")}
                        value={endValue}
                        disabled={submitting}
                        onChange={(event) => setEndValue(event.target.value)}
                        slotProps={{
                            inputLabel: { shrink: true },
                            htmlInput: currentEnd ? { max: toInputValue(currentEnd) } : undefined,
                        }}
                    />

                    <Alert severity="info" variant="outlined">
                        {t("saleWindow.editHint")}
                    </Alert>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>
                    {t("common.cancel")}
                </Button>
                <Button
                    onClick={() => submit(Date.now())}
                    color="error"
                    variant="outlined"
                    disabled={submitting}
                >
                    {t("saleWindow.closeNow")}
                </Button>
                <Button onClick={handleSave} variant="contained" disabled={submitting}>
                    {t("saleWindow.save")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default SaleWindowEditDialog;
