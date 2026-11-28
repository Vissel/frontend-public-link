import React from "react";
import { Alert, Grid, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { DateTimePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
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
                    <DateTimePicker
                        label={t("saleWindow.start")}
                        ampm={false}
                        value={startValue ? dayjs(startValue) : null}
                        disabled={disabled}
                        onChange={(d) => onStartChange(d ? d.format("YYYY-MM-DDTHH:mm") : "")}
                        slotProps={{ textField: { fullWidth: true, size: "small" } }}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                    <DateTimePicker
                        label={t("saleWindow.end")}
                        ampm={false}
                        value={endValue ? dayjs(endValue) : null}
                        disabled={disabled}
                        onChange={(d) => onEndChange(d ? d.format("YYYY-MM-DDTHH:mm") : "")}
                        // The hard limit: the plan end. The server rejects anything later.
                        maxDateTime={planEnd ? dayjs(toInputValue(planEnd)) : undefined}
                        slotProps={{ textField: { fullWidth: true, size: "small" } }}
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
