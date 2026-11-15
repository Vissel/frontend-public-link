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
 * Seller edit of an existing sale window: move the closing time earlier, close
 * the sale immediately, or extend it as far as the paid plan covers.
 *
 * Extending re-issues the public link, because the token inside the shared
 * address expires together with the end it was minted for — so the seller gets
 * a new address and is warned before submitting. The plan ceiling comes from
 * the same gate the create flow reads; the server re-checks it either way.
 */
const SaleWindowEditDialog = ({ open, environment, onClose, onSaved }) => {
    const { t } = useTranslation();
    const [endValue, setEndValue] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    // Latest paid moment across the seller's plans, quota ignored: the ceiling
    // for stretching a window that already exists. null once loaded means the
    // seller has no plan reaching into the future, so nothing can be extended.
    const [coverage, setCoverage] = useState(null);
    const [coverageLoaded, setCoverageLoaded] = useState(false);

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

    // Loaded once per open rather than per keystroke; a failure only costs the
    // hint, the server still refuses an end beyond the plan.
    useEffect(() => {
        if (!open) {
            return;
        }
        let ignore = false;
        setCoverage(null);
        setCoverageLoaded(false);
        pubApi
            .post("/api/v1/sellerPlan/check")
            .then((res) => {
                if (ignore) {
                    return;
                }
                setCoverage(parsePlanDate(res?.data?.coverageEndedDate));
            })
            .catch((err) => {
                console.error("Failed to load plan coverage", err);
            })
            .finally(() => {
                if (!ignore) {
                    setCoverageLoaded(true);
                }
            });
        return () => {
            ignore = true;
        };
    }, [open]);

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

    const chosenEnd = useMemo(() => fromInputValue(endValue), [endValue]);
    const extendsSale = !!(chosenEnd && currentEnd && chosenEnd.getTime() > currentEnd.getTime());

    const handleSave = () => {
        const end = fromInputValue(endValue);
        if (!end) {
            setError(t("saleWindow.errors.required"));
            return;
        }
        if (end.getTime() <= Date.now()) {
            setError(t("saleWindow.errors.endInPast"));
            return;
        }
        if (extendsSale && coverage && end.getTime() > coverage.getTime()) {
            setError(
                t("saleWindow.errors.endAfterPlan", { planEnd: formatDateTime(coverage) })
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
                        {" · "}
                        {t("saleWindow.planCoverage")}:{" "}
                        {coverage
                            ? formatDateTime(coverage)
                            : coverageLoaded
                                ? "\u2014"
                                : "\u2026"}
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
                            htmlInput: coverage ? { max: toInputValue(coverage) } : undefined,
                        }}
                    />

                    <Alert severity="info" variant="outlined">
                        {t("saleWindow.editHint")}
                    </Alert>

                    {extendsSale && (
                        <Alert severity="warning" variant="outlined">
                            {t("saleWindow.extendWarning")}
                        </Alert>
                    )}
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
