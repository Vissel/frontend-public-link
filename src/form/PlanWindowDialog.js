import React, { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    Typography,
} from "@mui/material";
import { DateTimePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";
import { pubApi } from "../api";
import { formatVND } from "../util/clipboard";
import { groupColor } from "../util/planGroup";

/**
 * Window of the plan about to be bought.
 *
 * The seller may move the start; the end is that start plus the plan's own
 * length, which the backend calculates. Both dates come from the same endpoint,
 * called when the popup opens and again on every change of the start, so the two
 * fields on screen can never disagree with each other or with what activation
 * will do.
 *
 * Only "Update" hands the window back to the screen that opened the popup.
 * Closing, by button or by clicking outside, drops an edit that was never
 * confirmed, so the purchase keeps the last window that was actually applied.
 */
const PlanWindowDialog = ({ open, plan, appliedStartAt, onApplied, onClose }) => {
    const { t } = useTranslation();
    const [startAt, setStartAt] = useState("");
    const [endAt, setEndAt] = useState("");
    const [planDay, setPlanDay] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    // Bumped by Retry so the fetch can be asked for again while the popup is
    // already open and nothing else changed.
    const [attempt, setAttempt] = useState(0);

    const planCode = plan?.planCode || "";

    const request = useCallback(
        async (start) => {
            if (!planCode) {
                return;
            }
            setLoading(true);
            setError("");
            try {
                const body = start ? { planCode, startAt: start } : { planCode };
                const res = await pubApi.post("/api/v1/sellerPlan/window", body);
                setStartAt(res.data?.startAt || "");
                setEndAt(res.data?.endAt || "");
                setPlanDay(res.data?.planDay ?? null);
            } catch (err) {
                console.error("Failed to calculate the plan window", err);
                // A 400 here is the start that was asked for, so the local
                // wording is about the start rather than about the connection.
                const fallback =
                    err?.response?.status === 400 ? t("planWindow.pastStart") : t("planWindow.loadError");
                setError(err?.response?.data?.message || fallback);
                // No end is better than an end that belongs to another start.
                setEndAt("");
            } finally {
                setLoading(false);
            }
        },
        [planCode, t]
    );

    useEffect(() => {
        if (!open) {
            return;
        }
        // Reopening keeps the window the seller already confirmed instead of
        // resetting it to "now" behind their back.
        request(appliedStartAt || "");
    }, [open, planCode, appliedStartAt, attempt, request]);

    const handleStartChange = (value) => {
        const next = value ? value.format("YYYY-MM-DDTHH:mm") : "";
        setStartAt(next);
        setEndAt("");
        if (next) {
            request(next);
        }
    };

    const handleUpdate = () => {
        onApplied?.(startAt, endAt);
        onClose?.();
    };

    // Nothing to show until a plan is chosen. Also keeps the date pickers out of
    // the tree while the popup is closed, so a screen that never opens it does
    // not have to provide the picker localisation.
    if (!plan) {
        return null;
    }

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{t("planWindow.title", { price: formatVND(plan?.fee) })}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    {loading && (
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <CircularProgress size={18} />
                            <Typography variant="body2" color="text.secondary">
                                {t("common.loading")}
                            </Typography>
                        </Stack>
                    )}

                    {!loading && error && (
                        <Alert
                            severity="warning"
                            action={
                                <Button color="inherit" size="small" onClick={() => setAttempt((a) => a + 1)}>
                                    {t("planWindow.retry")}
                                </Button>
                            }
                        >
                            {error}
                        </Alert>
                    )}

                    {/* The fields stay editable next to the error, because the
                        error is usually about the value in the first one. */}
                    <DateTimePicker
                        label={t("planWindow.startLabel")}
                        ampm={false}
                        format="DD/MM/YYYY HH:mm"
                        value={startAt ? dayjs(startAt) : null}
                        onChange={handleStartChange}
                        slotProps={{ textField: { fullWidth: true, size: "small" } }}
                    />
                    <DateTimePicker
                        label={t("planWindow.endLabel")}
                        ampm={false}
                        format="DD/MM/YYYY HH:mm"
                        readOnly
                        value={endAt ? dayjs(endAt) : null}
                        slotProps={{ textField: { fullWidth: true, size: "small" } }}
                    />
                    <Typography variant="caption" color="text.secondary">
                        {t("planWindow.daysHint", { planDay: planDay ?? plan?.planDay ?? "-" })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t("planWindow.defaultNote")}
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    {t("planWindow.close")}
                </Button>
                <Button
                    variant="contained"
                    color={groupColor(plan?.planGroup)}
                    onClick={handleUpdate}
                    disabled={loading || Boolean(error) || !startAt}
                >
                    {t("planWindow.update")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default PlanWindowDialog;