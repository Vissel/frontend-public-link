import React from "react";
import { Alert, Grid, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { formatDateTime, fromInputValue, parsePlanDate, toInputValue } from "../util/planWindow";

/**
 * Start/end pickers for the sale window of a product link.
 *
 * Both are plain datetime-local inputs in the browser's own time zone. The
 * backend resolves the same window again — it pulls a past start up to now,
 * mints the public link to expire exactly at the end, and refuses an end that
 * runs past the paid plan — so these bounds are guidance, not the only gate.
 */
const SaleWindowFields = ({
    startValue,
    endValue,
    onStartChange,
    onEndChange,
    planEndedDate,
    disabled = false,
}) => {
    const { t } = useTranslation();
    const planEnd = parsePlanDate(planEndedDate);
    const start = fromInputValue(startValue);
    const isScheduled = Boolean(start && start.getTime() > Date.now());

    return (
        <>
            <Typography variant="subtitle2">{t("saleWindow.title")}</Typography>
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                        fullWidth
                        size="small"
                        type="datetime-local"
                        label={t("saleWindow.start")}
                        value={startValue}
                        disabled={disabled}
                        onChange={(event) => onStartChange(event.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                        fullWidth
                        size="small"
                        type="datetime-local"
                        label={t("saleWindow.end")}
                        value={endValue}
                        disabled={disabled}
                        onChange={(event) => onEndChange(event.target.value)}
                        slotProps={{
                            inputLabel: { shrink: true },
                            // The hard limit: the plan end. The server rejects anything later.
                            htmlInput: planEnd ? { max: toInputValue(planEnd) } : undefined,
                        }}
                    />
                </Grid>
            </Grid>
            <Alert severity="info" variant="outlined">
                {planEnd
                    ? t("saleWindow.limitHint", { planEnd: formatDateTime(planEnd) })
                    : t("saleWindow.noPlanEnd")}
            </Alert>
            {isScheduled && (
                <Alert severity="warning" variant="outlined">
                    {t("saleWindow.scheduledHint")}
                </Alert>
            )}
        </>
    );
};

export default SaleWindowFields;
