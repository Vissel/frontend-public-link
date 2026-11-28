import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Button,
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

/**
 * Admin correction of when one plan starts.
 *
 * The setup page also has a bulk start field, but it applies one value to every
 * selected row; this dialog is the way to move a single plan, whether it is
 * still waiting for payment or already running. The end is not editable: it is
 * always the start plus the plan's own length, which the server recomputes.
 */

const WIRE_FORMAT = "YYYY-MM-DDTHH:mm";

/** Backend dates arrive as "yyyy-MM-dd HH:mm:ss"; the picker wants the wire string. */
const toWire = (value) => {
    if (!value) {
        return "";
    }
    const parsed = dayjs(String(value).replace(" ", "T"));
    return parsed.isValid() ? parsed.format(WIRE_FORMAT) : "";
};

const PlanStartDialog = ({ open, row, onClose, onSubmit }) => {
    const { t } = useTranslation();
    const [startAt, setStartAt] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // The prefill follows the row that was opened: a waiting order carries what
    // the seller asked for, a running plan carries its own start.
    useEffect(() => {
        if (!row) {
            return;
        }
        setStartAt(toWire(row.requestedStartAt || row.activeDate));
        setError("");
    }, [row]);

    const endPreview = useMemo(() => {
        if (!startAt) {
            return null;
        }
        const days = Number(row?.planDay) || 0;
        return dayjs(startAt).add(days, "day");
    }, [startAt, row]);

    const submit = async () => {
        setBusy(true);
        setError("");
        try {
            await onSubmit(startAt);
        } catch (err) {
            console.error("Failed to move the plan start", err);
            setError(err?.response?.data?.errorMessage || t("setup.errors.startFailed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
            <DialogTitle>{t("setup.startDialog.title")}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        {t("setup.startDialog.hint", {
                            user: row?.username || "-",
                            planDay: row?.planDay ?? "-",
                        })}
                    </Typography>
                    <DateTimePicker
                        label={t("setup.startDialog.startLabel")}
                        ampm={false}
                        format="DD/MM/YYYY HH:mm"
                        value={startAt ? dayjs(startAt) : null}
                        onChange={(value) => setStartAt(value ? value.format(WIRE_FORMAT) : "")}
                        slotProps={{ textField: { fullWidth: true, size: "small" } }}
                    />
                    <DateTimePicker
                        label={t("setup.startDialog.endLabel")}
                        ampm={false}
                        format="DD/MM/YYYY HH:mm"
                        readOnly
                        value={endPreview}
                        slotProps={{ textField: { fullWidth: true, size: "small" } }}
                    />
                    {error && <Alert severity="error">{error}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={busy}>
                    {t("common.cancel")}
                </Button>
                <Button variant="contained" onClick={submit} disabled={busy || !startAt}>
                    {t("setup.startDialog.submit")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default PlanStartDialog;