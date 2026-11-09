import { useEffect, useState } from "react";
import { Chip, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

const parseRemaining = (targetDate) => {
    const diff = new Date(targetDate).getTime() - Date.now();
    if (diff <= 0) return null;

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    return { days, hours, minutes, seconds, totalMs: diff };
};

const getUrgency = (remaining) => {
    if (!remaining) return "expired";
    if (remaining.totalMs < 1000 * 60 * 60) return "critical";
    return "default";
};

const URGENCY_STYLES = {
    default: { bg: "#fff3e0", color: "#e65100", icon: null },
    critical: { bg: "#ffebee", color: "#c62828", icon: "\ud83d\udd25" },
    expired: { bg: "#f5f5f5", color: "#9e9e9e", icon: "\u2716" },
};

const formatCountdown = (remaining, t) => {
    if (!remaining) return t("countdown.expired");
    const { days, hours, minutes, seconds } = remaining;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(" ");
};

/**
 * Inline badge variant — for table cells.
 * Shows icon + countdown in a small rounded pill.
 */
export function CountdownBadge({ targetDate }) {
    const [remaining, setRemaining] = useState(() => parseRemaining(targetDate));
    const { t } = useTranslation();

    useEffect(() => {
        if (!targetDate) return;
        setRemaining(parseRemaining(targetDate));
        const id = setInterval(() => {
            const next = parseRemaining(targetDate);
            setRemaining(next);
            if (!next) clearInterval(id);
        }, 1000);
        return () => clearInterval(id);
    }, [targetDate]);

    if (!targetDate) return <Typography variant="body2" color="text.disabled">-</Typography>;

    const urgency = getUrgency(remaining);
    const style = URGENCY_STYLES[urgency];

    return (
        <Stack
            direction="row"
            spacing={0.5}
            alignItems="center"
            sx={{
                display: "inline-flex",
                px: 1,
                py: 0.25,
                borderRadius: 2,
                bgcolor: style.bg,
                whiteSpace: "nowrap",
            }}
        >
            {style.icon && (
                <Typography variant="body2" component="span" sx={{ lineHeight: 1 }}>
                    {style.icon}
                </Typography>
            )}
            <Typography
                variant="body2"
                component="span"
                sx={{
                    fontWeight: 700,
                    color: style.color,
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: 0.3,
                }}
            >
                {formatCountdown(remaining, t)}
            </Typography>
        </Stack>
    );
}

/**
 * Chip variant — for page headers / prominent placement.
 */
export function CountdownChip({ targetDate }) {
    const [remaining, setRemaining] = useState(() => parseRemaining(targetDate));
    const { t } = useTranslation();

    useEffect(() => {
        if (!targetDate) return;
        setRemaining(parseRemaining(targetDate));
        const id = setInterval(() => {
            const next = parseRemaining(targetDate);
            setRemaining(next);
            if (!next) clearInterval(id);
        }, 1000);
        return () => clearInterval(id);
    }, [targetDate]);

    if (!targetDate) return null;

    const urgency = getUrgency(remaining);
    const style = URGENCY_STYLES[urgency];

    return (
        <Chip
            {...(style.icon ? { icon: <span style={{ fontSize: 16 }}>{style.icon}</span> } : {})}
            label={
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {formatCountdown(remaining, t)}
                </span>
            }
            size="small"
            sx={{
                bgcolor: style.bg,
                color: style.color,
                fontWeight: 700,
                "& .MuiChip-label": { color: style.color },
            }}
        />
    );
}

export default CountdownBadge;
