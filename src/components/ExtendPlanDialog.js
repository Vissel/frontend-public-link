import PropTypes from "prop-types";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Stack,
    TextField,
    Typography,
} from "@mui/material";

const formatVND = (value) =>
    new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(Number(value) || 0);

const toTime = (value) => {
    if (!value) return null;
    const parsed = new Date(String(value).replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date) =>
    date ? `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}` : "—";

/**
 * Buy extra days on a running plan. The price follows the plan's daily rate and
 * the new end date is previewed before submitting, because the admin has to
 * quote both to the seller over chat. Nothing moves until the seller pays and
 * the order is marked paid.
 */
const ExtendPlanDialog = ({ open, row, onClose, onSubmit }) => {
    const { t } = useTranslation();
    const [days, setDays] = useState("1");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setDays("1");
            setSubmitting(false);
        }
    }, [open]);

    const parsedDays = useMemo(() => {
        const value = parseInt(days, 10);
        return Number.isNaN(value) || value <= 0 ? null : value;
    }, [days]);

    const preview = useMemo(() => {
        if (!row || !parsedDays) return null;
        const planDay = Number(row.planDay) || 0;
        const fee = Number(row.fee) || 0;
        // Same rule as the backend: daily rate rounded up, so a short extension of
        // a cheap plan never collapses to zero.
        const amount = planDay > 0 && fee > 0 ? Math.ceil((fee * parsedDays) / planDay) : fee;
        const currentEnd = toTime(row.endedDate);
        // A plan that already ran out is extended from today, not from a past date.
        const base = currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date();
        const next = new Date(base.getTime());
        next.setDate(next.getDate() + parsedDays);
        return { amount, from: formatDate(base), to: formatDate(next) };
    }, [row, parsedDays]);

    const handleSubmit = async () => {
        if (!parsedDays || !row) return;
        setSubmitting(true);
        try {
            await onSubmit(parsedDays);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={submitting ? () => { } : onClose} fullWidth maxWidth="xs">
            <DialogTitle>{t("setup.extend.title")}</DialogTitle>
            <DialogContent>
                <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                        {t("setup.extend.hint")}
                    </Typography>
                    <Typography variant="subtitle2">{row?.username}</Typography>

                    <TextField
                        label={t("setup.extend.days")}
                        type="number"
                        value={days}
                        onChange={(e) => setDays(e.target.value)}
                        inputProps={{ min: 1, max: 3650, step: 1 }}
                        size="small"
                        fullWidth
                        autoFocus
                    />

                    {preview ? (
                        <>
                            <Divider />
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="body2" color="text.secondary">
                                    {t("setup.extend.currentEnd")}
                                </Typography>
                                <Typography variant="body2">{preview.from}</Typography>
                            </Stack>
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="body2" color="text.secondary">
                                    {t("setup.extend.newEnd")}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {preview.to}
                                </Typography>
                            </Stack>
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="body2" color="text.secondary">
                                    {t("setup.extend.amount")}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {formatVND(preview.amount)} VND
                                </Typography>
                            </Stack>
                            <Typography variant="caption" color="text.secondary">
                                {t("setup.extend.amountNote")}
                            </Typography>
                        </>
                    ) : (
                        <Typography variant="caption" color="error">
                            {t("setup.extend.daysInvalid")}
                        </Typography>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={submitting}>
                    {t("common.cancel")}
                </Button>
                <Button
                    variant="contained"
                    onClick={handleSubmit}
                    disabled={!preview || submitting}
                >
                    {submitting ? t("common.submitting") : t("setup.extend.submit")}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

ExtendPlanDialog.propTypes = {
    open: PropTypes.bool.isRequired,
    row: PropTypes.object,
    onClose: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
};

export default ExtendPlanDialog;
