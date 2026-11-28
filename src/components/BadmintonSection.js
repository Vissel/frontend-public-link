import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    ButtonGroup,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControlLabel,
    MenuItem,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from "@mui/material";
import { Link as RouterLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { pubApi } from "../api";
import { useAuth } from "../AuthContext";
import CardWrapper from "./CardWrapper";
import { copyText, formatVND } from "../util/clipboard";
import { addDays, ISO_WEEKDAYS, isoWeekday, shortDate, todayIso } from "../util/yoga";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";

const PUBLIC = "/api/v1/publish/badminton";
const SELLER = "/api/v1/badminton/seller";
const POLL_INTERVAL_MS = 15000;
const OPEN_STATUSES = ["PENDING_PAYMENT", "WAITING_CONFIRM"];
// When the opening day has no frames, the page steps forward to the next day
// that does, up to this many days ahead.
const AUTO_ADVANCE_LIMIT_DAYS = 30;

const GridLegendItem = ({ color, label }) => (
    <Stack direction="row" spacing={0.5} alignItems="center">
        <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color }} />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
            {label}
        </Typography>
    </Stack>
);

const statusColor = (status) => {
    if (status === "CONFIRMED") return "success";
    if (status === "WAITING_CONFIRM") return "warning";
    if (status === "REJECTED") return "error";
    if (status === "CANCELLED") return "default";
    return "info";
};

const minutes = (time) => {
    const [hour, minute] = String(time || "0:0").split(":").map(Number);
    return hour * 60 + minute;
};

const newSchedules = () => ISO_WEEKDAYS.map((_, index) => ({
    dayOfWeek: index + 1,
    enabled: index === 0,
    openTime: "06:00",
    closeTime: "22:00",
    slotMinutes: 60,
    priceVnd: "",
}));

const schedulesFromCourt = (court) => ISO_WEEKDAYS.map((_, index) => {
    const dayOfWeek = index + 1;
    const existing = (court?.schedules || []).find((item) => item.dayOfWeek === dayOfWeek);
    return {
        dayOfWeek,
        enabled: Boolean(existing),
        openTime: existing?.openTime || "06:00",
        closeTime: existing?.closeTime || "22:00",
        slotMinutes: existing?.slotMinutes || 60,
        priceVnd: existing?.priceVnd ?? "",
    };
});

/**
 * One badminton sale page: a date-scoped grid of time frames by court, the
 * player's bank-transfer flow, and seller court/booking management.
 */
const BadmintonSection = ({ token, transferInfo }) => {
    const { t } = useTranslation();
    const { isAuthenticated } = useAuth();
    const location = useLocation();

    const [date, setDate] = useState(() => todayIso());
    const initialDateRef = useRef(todayIso());
    const autoAdvanceLimitRef = useRef(addDays(todayIso(), AUTO_ADVANCE_LIMIT_DAYS));
    const gridRef = useRef(null);
    const autoScrolledRef = useRef(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const [selected, setSelected] = useState(null);
    const [bookOpen, setBookOpen] = useState(false);
    const [bookingBusy, setBookingBusy] = useState(false);

    const [activeBooking, setActiveBooking] = useState(null);
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [paymentBusy, setPaymentBusy] = useState(false);
    const [copyKey, setCopyKey] = useState("");

    const [courtsOpen, setCourtsOpen] = useState(false);
    const [courts, setCourts] = useState([]);
    const [courtsLoading, setCourtsLoading] = useState(false);
    const [courtEditorOpen, setCourtEditorOpen] = useState(false);
    const [courtDraft, setCourtDraft] = useState(null);
    const [courtBusy, setCourtBusy] = useState(false);

    const [bookingsOpen, setBookingsOpen] = useState(false);
    const [sellerBookings, setSellerBookings] = useState([]);
    const [bookingsLoading, setBookingsLoading] = useState(false);
    const [bookingActionCode, setBookingActionCode] = useState("");

    const sellerView = Boolean(data?.sellerView);
    const returnTo = `${location.pathname}${location.search}`;
    const loginHref = `/login?next=${encodeURIComponent(returnTo)}`;
    const registerHref = `/register?next=${encodeURIComponent(returnTo)}`;

    const loadGrid = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError("");
        try {
            const response = await pubApi.post(`${PUBLIC}/grid`, { token, date });
            setData(response.data || null);
        } catch (err) {
            console.error("Badminton grid load failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.load"));
        } finally {
            setLoading(false);
        }
    }, [date, t, token]);

    useEffect(() => {
        loadGrid();
    }, [loadGrid]);

    const hasOpenBooking = (data?.myBookings || []).some((booking) => OPEN_STATUSES.includes(booking.status));
    useEffect(() => {
        if (!hasOpenBooking) return undefined;
        const interval = setInterval(loadGrid, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [hasOpenBooking, loadGrid]);

    useEffect(() => {
        if (!activeBooking || !data?.myBookings) return;
        const updated = data.myBookings.find((booking) => booking.bookingCode === activeBooking.bookingCode);
        if (!updated || updated.status === activeBooking.status) return;
        setActiveBooking(updated);
        if (updated.status === "CONFIRMED") {
            setNotice(t("badminton.success.confirmed"));
        } else if (updated.status === "REJECTED") {
            setError(t("badminton.errors.rejected"));
        } else if (updated.status === "CANCELLED") {
            setNotice(t("badminton.success.cancelled"));
        }
    }, [activeBooking, data?.myBookings, t]);

    const timeRows = useMemo(() => {
        const rows = new Map();
        (data?.courts || []).forEach((court) => {
            (court.frames || []).forEach((frame) => {
                const key = `${frame.startTime}-${frame.endTime}`;
                if (!rows.has(key)) rows.set(key, { startTime: frame.startTime, endTime: frame.endTime });
            });
        });
        return Array.from(rows.values()).sort((a, b) => minutes(a.startTime) - minutes(b.startTime));
    }, [data]);

    // Opening UX: land on the nearest day that actually has bookable frames
    // instead of an empty grid. Only the opening day auto-advances - a manual
    // date pick is never overridden.
    useEffect(() => {
        if (!data?.date || date !== initialDateRef.current) return;
        const hasFrames = (data.courts || []).some((court) => (court.frames || []).length > 0);
        if (hasFrames) {
            if (!autoScrolledRef.current) {
                const firstFreeKey = timeRows.find((row) => (data.courts || []).some((court) => (court.frames || [])
                    .some((frame) => `${frame.startTime}-${frame.endTime}` === `${row.startTime}-${row.endTime}`
                        && frame.state === "FREE")));
                if (firstFreeKey && gridRef.current) {
                    const row = gridRef.current.querySelector(
                        `[data-time-key="${firstFreeKey.startTime}-${firstFreeKey.endTime}"]`
                    );
                    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                }
                autoScrolledRef.current = true;
            }
            return;
        }
        if (date >= autoAdvanceLimitRef.current) {
            setNotice(t("badminton.noAvailability", { days: AUTO_ADVANCE_LIMIT_DAYS }));
            return;
        }
        const nextDate = addDays(date, 1);
        // The landing day is whichever date finally has frames, so the
        // first-free-row scroll also works on it.
        initialDateRef.current = nextDate;
        setDate(nextDate);
    }, [data, date, t, timeRows]);

    const loadCourts = useCallback(async () => {
        setCourtsLoading(true);
        try {
            const response = await pubApi.post(`${SELLER}/courts`, { token });
            setCourts(response.data || []);
        } catch (err) {
            console.error("Badminton courts load failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.loadCourts"));
        } finally {
            setCourtsLoading(false);
        }
    }, [t, token]);

    const loadSellerBookings = useCallback(async () => {
        setBookingsLoading(true);
        try {
            const response = await pubApi.post(`${SELLER}/bookings`, { token, date });
            setSellerBookings(response.data || []);
        } catch (err) {
            console.error("Badminton bookings load failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.loadBookings"));
        } finally {
            setBookingsLoading(false);
        }
    }, [date, t, token]);

    const openCourts = async () => {
        setCourtsOpen(true);
        await loadCourts();
    };

    const openCourtEditor = (court) => {
        setCourtDraft({
            courtCode: court?.courtCode || "",
            courtName: court?.courtName || "",
            schedules: court ? schedulesFromCourt(court) : newSchedules(),
        });
        setCourtEditorOpen(true);
    };

    const updateSchedule = (dayOfWeek, field, value) => {
        setCourtDraft((previous) => ({
            ...previous,
            schedules: previous.schedules.map((schedule) => (
                schedule.dayOfWeek === dayOfWeek ? { ...schedule, [field]: value } : schedule
            )),
        }));
    };

    const handleSaveCourt = async () => {
        const schedules = (courtDraft?.schedules || [])
            .filter((schedule) => schedule.enabled)
            .map((schedule) => ({
                dayOfWeek: Number(schedule.dayOfWeek),
                openTime: schedule.openTime,
                closeTime: schedule.closeTime,
                slotMinutes: Number(schedule.slotMinutes),
                priceVnd: Number(schedule.priceVnd || 0),
            }));
        if (!courtDraft?.courtName?.trim() || schedules.length === 0) {
            setError(t("badminton.errors.courtRequired"));
            return;
        }
        setCourtBusy(true);
        setError("");
        try {
            await pubApi.post(`${SELLER}/courts/save`, {
                token,
                courtCode: courtDraft.courtCode || undefined,
                courtName: courtDraft.courtName.trim(),
                schedules,
            });
            setCourtEditorOpen(false);
            // The editor is opened from inside the courts dialog, and the save
            // confirmation renders on the page behind it. Leaving that dialog
            // up hides the proof the save worked, so dismiss the whole stack.
            setCourtsOpen(false);
            setNotice(t("badminton.success.courtSaved"));
            await loadCourts();
            await loadGrid();
        } catch (err) {
            console.error("Badminton court save failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.saveCourt"));
        } finally {
            setCourtBusy(false);
        }
    };

    const handleDeleteCourt = async (court) => {
        if (!window.confirm(t("badminton.confirmDeleteCourt", { name: court.courtName }))) return;
        setCourtBusy(true);
        setError("");
        try {
            await pubApi.post(`${SELLER}/courts/delete`, { token, courtCode: court.courtCode });
            setNotice(t("badminton.success.courtDeleted"));
            await loadCourts();
            await loadGrid();
        } catch (err) {
            console.error("Badminton court delete failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.deleteCourt"));
        } finally {
            setCourtBusy(false);
        }
    };

    const openBook = (court, frame) => {
        setSelected({ court, frame });
        setBookOpen(true);
    };

    const openBooking = (booking) => {
        setActiveBooking(booking);
        setPaymentOpen(true);
    };

    const handleBook = async () => {
        if (!isAuthenticated || !selected) return;
        setBookingBusy(true);
        setError("");
        try {
            const response = await pubApi.post(`${PUBLIC}/book`, {
                token,
                courtCode: selected.court.courtCode,
                date,
                startTime: selected.frame.startTime,
            });
            setActiveBooking(response.data);
            setBookOpen(false);
            setPaymentOpen(true);
            setNotice(t("badminton.success.booked"));
            await loadGrid();
        } catch (err) {
            console.error("Badminton booking failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.book"));
        } finally {
            setBookingBusy(false);
        }
    };

    const handlePaymentConfirm = async () => {
        if (!activeBooking) return;
        setPaymentBusy(true);
        setError("");
        try {
            const response = await pubApi.post(`${PUBLIC}/payment/confirm`, {
                token,
                bookingCode: activeBooking.bookingCode,
            });
            setActiveBooking(response.data);
            setNotice(t("badminton.success.paymentConfirmed"));
            await loadGrid();
        } catch (err) {
            console.error("Badminton payment confirmation failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.paymentConfirm"));
        } finally {
            setPaymentBusy(false);
        }
    };

    const handleCancel = async (bookingCode) => {
        setPaymentBusy(true);
        setError("");
        try {
            const response = await pubApi.post(`${PUBLIC}/cancel`, { token, bookingCode });
            setActiveBooking(response.data);
            setNotice(t("badminton.success.cancelled"));
            await loadGrid();
        } catch (err) {
            console.error("Badminton cancellation failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.cancel"));
        } finally {
            setPaymentBusy(false);
        }
    };

    const handleCopy = (key, value) => {
        copyText(value, () => {
            setCopyKey(key);
            setTimeout(() => setCopyKey(""), 2000);
        });
    };

    const openSellerBookings = async () => {
        setBookingsOpen(true);
        await loadSellerBookings();
    };

    const handleSellerDecision = async (bookingCode, decision) => {
        setBookingActionCode(bookingCode);
        setError("");
        try {
            await pubApi.post(`${SELLER}/bookings/${decision}`, { token, bookingCode });
            setNotice(decision === "confirm"
                ? t("badminton.success.sellerConfirmed")
                : t("badminton.success.sellerRejected"));
            await loadSellerBookings();
            await loadGrid();
        } catch (err) {
            console.error("Badminton seller decision failed", err);
            setError(err?.response?.data?.errorMessage || t("badminton.errors.sellerDecision"));
        } finally {
            setBookingActionCode("");
        }
    };

    const renderBookingStatus = (booking) => (
        <Chip
            size="small"
            color={statusColor(booking?.status)}
            label={t(`badminton.status.${booking?.status || "PENDING_PAYMENT"}`)}
            onClick={() => { }}
            clickable={false}
        />
    );

    return (
        <Stack spacing={1.5}>
            {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}

            <Box
                sx={{
                    p: { xs: 1.5, sm: 2 },
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                }}
            >
                <Stack
                    direction={{ xs: "column", lg: "row" }}
                    spacing={1.25}
                    alignItems={{ xs: "stretch", sm: "center" }}
                    justifyContent="space-between"
                >
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={{ xs: "stretch", sm: "center" }}
                        sx={{ minWidth: 0 }}
                    >
                        <DatePicker
                            label={t("badminton.date")}
                            value={date ? dayjs(date) : null}
                            onChange={(d) => setDate(d ? d.format("YYYY-MM-DD") : "")}
                            slotProps={{
                                textField: { size: "small", sx: { width: { xs: "100%", sm: 170 }, flexShrink: 0 } },
                            }}
                        />
                        <ButtonGroup size="small" variant="outlined" aria-label={t("badminton.date")}>
                            <Button
                                title={t("badminton.previousDay")}
                                aria-label={t("badminton.previousDay")}
                                onClick={() => setDate(addDays(date, -1))}
                                sx={{ minWidth: 34, px: 1 }}
                            >
                                ‹
                            </Button>
                            <Button onClick={() => setDate(todayIso())} sx={{ whiteSpace: "nowrap" }}>
                                {t("badminton.today")}
                            </Button>
                            <Button
                                title={t("badminton.nextDay")}
                                aria-label={t("badminton.nextDay")}
                                onClick={() => setDate(addDays(date, 1))}
                                sx={{ minWidth: 34, px: 1 }}
                            >
                                ›
                            </Button>
                        </ButtonGroup>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                            {t(`badminton.days.${isoWeekday(date)}`)} · {shortDate(date)}
                        </Typography>
                    </Stack>
                    {sellerView && (
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}
                        >
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={openCourts}
                                sx={{ whiteSpace: "nowrap", flex: { xs: 1, sm: "0 0 auto" } }}
                            >
                                {t("badminton.manageCourts")}
                            </Button>
                            <Button
                                size="small"
                                variant="contained"
                                onClick={openSellerBookings}
                                sx={{ whiteSpace: "nowrap", flex: { xs: 1, sm: "0 0 auto" } }}
                            >
                                {t("badminton.manageBookings")}
                            </Button>
                        </Stack>
                    )}
                </Stack>
            </Box>

            {!isAuthenticated && !sellerView && (
                <Alert severity="info">{t("badminton.loginHint")}</Alert>
            )}

            <TableContainer ref={gridRef} component={CardWrapper} sx={{ overflowX: "auto", p: 0, borderRadius: 3 }}>
                <Box
                    sx={{
                        px: { xs: 1.5, sm: 2 },
                        py: 1.25,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                    }}
                >
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        justifyContent="space-between"
                    >
                        <Typography variant="subtitle2" fontWeight={700}>
                            {t("badminton.scheduleTitle")}
                        </Typography>
                        <Stack direction="row" spacing={1.5} flexWrap="wrap">
                            <GridLegendItem color="primary.main" label={t("badminton.available")} />
                            <GridLegendItem color="grey.500" label={t("badminton.booked")} />
                            <GridLegendItem color="success.main" label={t("badminton.yourBooking")} />
                        </Stack>
                    </Stack>
                </Box>
                <Table stickyHeader size="small" sx={{ minWidth: 150 + (data?.courts?.length || 0) * 150, tableLayout: "fixed" }}>
                    <TableHead sx={{ position: "sticky", top: 0, zIndex: 1, bgcolor: "background.paper" }}>
                        <TableRow>
                            <TableCell sx={{ width: 150, fontWeight: 700 }}>{t("badminton.time")}</TableCell>
                            {(data?.courts || []).map((court) => (
                                <TableCell key={court.courtCode} sx={{ fontWeight: 700 }}>
                                    {court.courtName}
                                    {!court.active && (
                                        <Typography variant="caption" color="text.secondary" display="block">
                                            {t("badminton.inactive")}
                                        </Typography>
                                    )}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {timeRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={(data?.courts?.length || 0) + 1} align="center">
                                    {loading ? t("common.loading") : t("badminton.noFrames")}
                                </TableCell>
                            </TableRow>
                        ) : timeRows.map((row) => {
                            const key = `${row.startTime}-${row.endTime}`;
                            return (
                                <TableRow key={key} data-time-key={key}>
                                    <TableCell sx={{ verticalAlign: "middle", fontWeight: 600 }}>
                                        {row.startTime}–{row.endTime}
                                    </TableCell>
                                    {(data?.courts || []).map((court) => {
                                        const frame = (court.frames || []).find((item) => `${item.startTime}-${item.endTime}` === key);
                                        if (!frame) {
                                            return <TableCell key={court.courtCode} sx={{ bgcolor: "action.hover" }} />;
                                        }
                                        const mine = frame.state === "MINE";
                                        const free = frame.state === "FREE" && court.active;
                                        const color = mine ? "success" : free ? "primary" : "default";
                                        return (
                                            <TableCell key={court.courtCode} sx={{ p: 0.5 }}>
                                                <Button
                                                    fullWidth
                                                    variant="outlined"
                                                    color={color}
                                                    disabled={!free && !mine && !sellerView}
                                                    onClick={() => {
                                                        if (sellerView) {
                                                            openSellerBookings();
                                                        } else if (mine) {
                                                            const booking = (data.myBookings || []).find((item) => item.bookingCode === frame.bookingCode);
                                                            if (booking) openBooking(booking);
                                                        } else if (free) {
                                                            openBook(court, frame);
                                                        }
                                                    }}
                                                    sx={{ textTransform: "none", minHeight: 36, fontSize: "0.75rem" }}
                                                >
                                                    {mine
                                                        ? t("badminton.yourBooking")
                                                        : free
                                                            ? formatVND(frame.priceVnd)
                                                            : t("badminton.booked")}
                                                </Button>
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {!sellerView && (data?.myBookings || []).length > 0 && (
                <CardWrapper>
                    <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                        {t("badminton.myBookings")}
                    </Typography>
                    <TableContainer sx={{ overflowX: "auto" }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t("badminton.court")}</TableCell>
                                    <TableCell>{t("badminton.time")}</TableCell>
                                    <TableCell>{t("badminton.price")}</TableCell>
                                    <TableCell>{t("badminton.statusLabel")}</TableCell>
                                    <TableCell align="right">{t("badminton.action")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(data.myBookings || []).map((booking) => (
                                    <TableRow key={booking.bookingCode}>
                                        <TableCell>{booking.courtName}</TableCell>
                                        <TableCell>{booking.startTime}–{booking.endTime}</TableCell>
                                        <TableCell>{formatVND(booking.priceVnd)} VND</TableCell>
                                        <TableCell>{renderBookingStatus(booking)}</TableCell>
                                        <TableCell align="right">
                                            <Button size="small" onClick={() => openBooking(booking)}>
                                                {OPEN_STATUSES.includes(booking.status)
                                                    ? t("badminton.payment")
                                                    : t("badminton.details")}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardWrapper>
            )}

            <Dialog open={bookOpen} onClose={bookingBusy ? undefined : () => setBookOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t("badminton.bookTitle")}</DialogTitle>
                <DialogContent>
                    {selected && (
                        <Stack spacing={2} sx={{ pt: 1 }}>
                            <Typography variant="subtitle1" fontWeight={700}>{selected.court.courtName}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {date} · {selected.frame.startTime}–{selected.frame.endTime}
                            </Typography>
                            <Typography variant="h6">{formatVND(selected.frame.priceVnd)} VND</Typography>
                            {!isAuthenticated ? (
                                <Alert severity="info">{t("badminton.accountPrompt")}</Alert>
                            ) : null}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBookOpen(false)} disabled={bookingBusy}>{t("common.cancel")}</Button>
                    {isAuthenticated ? (
                        <Button variant="contained" onClick={handleBook} disabled={bookingBusy}>
                            {bookingBusy ? t("badminton.booking") : t("badminton.book")}
                        </Button>
                    ) : (
                        <Stack direction="row" spacing={1}>
                            <Button component={RouterLink} to={registerHref} variant="outlined">
                                {t("badminton.register")}
                            </Button>
                            <Button component={RouterLink} to={loginHref} variant="contained">
                                {t("badminton.login")}
                            </Button>
                        </Stack>
                    )}
                </DialogActions>
            </Dialog>

            <Dialog open={paymentOpen} onClose={paymentBusy ? undefined : () => setPaymentOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{t("badminton.paymentTitle")}</DialogTitle>
                <DialogContent>
                    {activeBooking && (
                        <Stack spacing={2} sx={{ pt: 1 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Box>
                                    <Typography variant="subtitle1" fontWeight={700}>{activeBooking.courtName}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {activeBooking.date} · {activeBooking.startTime}–{activeBooking.endTime}
                                    </Typography>
                                </Box>
                                {renderBookingStatus(activeBooking)}
                            </Stack>
                            <Typography variant="h6">{formatVND(activeBooking.priceVnd)} VND</Typography>

                            {activeBooking.status === "PENDING_PAYMENT" && (
                                <Alert severity="info">{t("badminton.paymentGuide")}</Alert>
                            )}
                            {activeBooking.status === "WAITING_CONFIRM" && (
                                <Alert severity="warning">{t("badminton.waitingSeller")}</Alert>
                            )}
                            {activeBooking.status === "CONFIRMED" && (
                                <Alert severity="success">{t("badminton.confirmedMessage")}</Alert>
                            )}
                            {activeBooking.status === "REJECTED" && (
                                <Alert severity="error">{t("badminton.rejectedMessage")}</Alert>
                            )}
                            {activeBooking.status === "CANCELLED" && (
                                <Alert severity="info">{t("badminton.cancelledMessage")}</Alert>
                            )}

                            {transferInfo ? (
                                <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                                    <Stack spacing={1.5} alignItems="center">
                                        <Typography variant="subtitle1" fontWeight={700}>
                                            {transferInfo.transferIssuer || t("badminton.bankTransfer")}
                                        </Typography>
                                        {transferInfo.qrImage && (
                                            <Box
                                                component="img"
                                                src={transferInfo.qrImage}
                                                alt={t("badminton.bankQr")}
                                                sx={{ height: 240, maxWidth: "100%", width: "auto", objectFit: "contain" }}
                                            />
                                        )}
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Typography variant="body2">
                                                {t("badminton.accountNumber")}: {transferInfo.transferNumber}
                                            </Typography>
                                            <Button
                                                size="small"
                                                onClick={() => handleCopy("account", transferInfo.transferNumber)}
                                            >
                                                {copyKey === "account" ? t("common.copied") : t("common.copy")}
                                            </Button>
                                        </Stack>
                                        <Typography variant="body2">
                                            {t("badminton.accountName")}: {transferInfo.accountName || "-"}
                                        </Typography>
                                        {transferInfo.defaultMessage && (
                                            <Alert severity="info" sx={{ fontSize: 13 }}>
                                                {t("badminton.transferContent")}: {transferInfo.defaultMessage}
                                            </Alert>
                                        )}
                                    </Stack>
                                </Box>
                            ) : (
                                <Alert severity="warning">{t("badminton.noTransfer")}</Alert>
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPaymentOpen(false)} disabled={paymentBusy}>{t("common.close")}</Button>
                    {OPEN_STATUSES.includes(activeBooking?.status) && (
                        <Button
                            color="error"
                            onClick={() => handleCancel(activeBooking.bookingCode)}
                            disabled={paymentBusy}
                        >
                            {t("badminton.cancelBooking")}
                        </Button>
                    )}
                    {activeBooking?.status === "PENDING_PAYMENT" && (
                        <Button variant="contained" onClick={handlePaymentConfirm} disabled={paymentBusy}>
                            {paymentBusy ? t("badminton.processing") : t("badminton.iTransferred")}
                        </Button>
                    )}
                </DialogActions>
            </Dialog>

            <Dialog open={courtsOpen} onClose={courtBusy ? undefined : () => setCourtsOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{t("badminton.courtsTitle")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Alert severity="info">{t("badminton.courtLimit", { count: courts.length, max: 6 })}</Alert>
                        <Box>
                            <Button
                                variant="contained"
                                onClick={() => openCourtEditor(null)}
                                disabled={courts.length >= 6 || courtsLoading}
                            >
                                {t("badminton.addCourt")}
                            </Button>
                        </Box>
                        {courtsLoading ? (
                            <Typography color="text.secondary">{t("common.loading")}</Typography>
                        ) : courts.length === 0 ? (
                            <Typography color="text.secondary">{t("badminton.noCourts")}</Typography>
                        ) : courts.map((court) => (
                            <Stack
                                key={court.courtCode}
                                direction={{ xs: "column", sm: "row" }}
                                spacing={1}
                                alignItems={{ sm: "center" }}
                                sx={{ p: 1.5, border: "1px solid", borderColor: "divider", borderRadius: 2 }}
                            >
                                <Box sx={{ flex: 1 }}>
                                    <Typography fontWeight={700}>{court.courtName}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {court.active ? t("common.active") : t("badminton.inactive")}
                                        {" · "}
                                        {(court.schedules || []).length} {t("badminton.scheduleDays")}
                                    </Typography>
                                </Box>
                                <Button size="small" onClick={() => openCourtEditor(court)} disabled={courtBusy}>
                                    {t("badminton.edit")}
                                </Button>
                                <Button size="small" color="error" onClick={() => handleDeleteCourt(court)} disabled={courtBusy}>
                                    {t("badminton.delete")}
                                </Button>
                            </Stack>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCourtsOpen(false)} disabled={courtBusy}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={courtEditorOpen} onClose={courtBusy ? undefined : () => setCourtEditorOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{courtDraft?.courtCode ? t("badminton.editCourt") : t("badminton.newCourt")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <TextField
                            label={t("badminton.courtName")}
                            value={courtDraft?.courtName || ""}
                            onChange={(event) => setCourtDraft((previous) => ({ ...previous, courtName: event.target.value }))}
                            fullWidth
                            required
                        />
                        <Divider />
                        {(courtDraft?.schedules || []).map((schedule) => (
                            <Box key={schedule.dayOfWeek} sx={{ p: 1.25, border: "1px solid", borderColor: "divider", borderRadius: 2 }}>
                                <Stack spacing={1.25}>
                                    <FormControlLabel
                                        control={(
                                            <Checkbox
                                                checked={schedule.enabled}
                                                onChange={(event) => updateSchedule(schedule.dayOfWeek, "enabled", event.target.checked)}
                                            />
                                        )}
                                        label={t(`badminton.days.${schedule.dayOfWeek}`)}
                                    />
                                    {schedule.enabled && (
                                        <>
                                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                                                <TextField
                                                    type="time"
                                                    size="small"
                                                    label={t("badminton.opens")}
                                                    value={schedule.openTime}
                                                    onChange={(event) => updateSchedule(schedule.dayOfWeek, "openTime", event.target.value)}
                                                    InputLabelProps={{ shrink: true }}
                                                    fullWidth
                                                />
                                                <TextField
                                                    type="time"
                                                    size="small"
                                                    label={t("badminton.closes")}
                                                    value={schedule.closeTime}
                                                    onChange={(event) => updateSchedule(schedule.dayOfWeek, "closeTime", event.target.value)}
                                                    InputLabelProps={{ shrink: true }}
                                                    fullWidth
                                                />
                                            </Stack>
                                            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                                                <TextField
                                                    select
                                                    size="small"
                                                    label={t("badminton.slotLength")}
                                                    value={schedule.slotMinutes}
                                                    onChange={(event) => updateSchedule(schedule.dayOfWeek, "slotMinutes", Number(event.target.value))}
                                                    fullWidth
                                                >
                                                    {[30, 60, 90, 120].map((value) => (
                                                        <MenuItem key={value} value={value}>{value} {t("badminton.minutes")}</MenuItem>
                                                    ))}
                                                </TextField>
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    label={t("badminton.pricePerSlot")}
                                                    value={schedule.priceVnd}
                                                    onChange={(event) => updateSchedule(schedule.dayOfWeek, "priceVnd", event.target.value)}
                                                    inputProps={{ min: 0 }}
                                                    fullWidth
                                                />
                                            </Stack>
                                        </>
                                    )}
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCourtEditorOpen(false)} disabled={courtBusy}>{t("common.cancel")}</Button>
                    <Button variant="contained" onClick={handleSaveCourt} disabled={courtBusy}>
                        {courtBusy ? t("common.saving") : t("common.save")}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={bookingsOpen} onClose={bookingActionCode ? undefined : () => setBookingsOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{t("badminton.sellerBookingsTitle", { date })}</DialogTitle>
                <DialogContent>
                    <TableContainer sx={{ overflowX: "auto" }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t("badminton.court")}</TableCell>
                                    <TableCell>{t("badminton.buyer")}</TableCell>
                                    <TableCell>{t("badminton.time")}</TableCell>
                                    <TableCell>{t("badminton.price")}</TableCell>
                                    <TableCell>{t("badminton.statusLabel")}</TableCell>
                                    <TableCell align="right">{t("badminton.action")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {bookingsLoading ? (
                                    <TableRow><TableCell colSpan={6} align="center">{t("common.loading")}</TableCell></TableRow>
                                ) : sellerBookings.length === 0 ? (
                                    <TableRow><TableCell colSpan={6} align="center">{t("badminton.noBookings")}</TableCell></TableRow>
                                ) : sellerBookings.map((booking) => (
                                    <TableRow key={booking.bookingCode}>
                                        <TableCell>{booking.courtName}</TableCell>
                                        <TableCell>{booking.buyerName || booking.buyerUsername}</TableCell>
                                        <TableCell>{booking.startTime}–{booking.endTime}</TableCell>
                                        <TableCell>{formatVND(booking.priceVnd)} VND</TableCell>
                                        <TableCell>{renderBookingStatus(booking)}</TableCell>
                                        <TableCell align="right">
                                            {booking.status === "WAITING_CONFIRM" ? (
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        disabled={bookingActionCode === booking.bookingCode}
                                                        onClick={() => handleSellerDecision(booking.bookingCode, "reject")}
                                                    >
                                                        {t("badminton.reject")}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="success"
                                                        disabled={bookingActionCode === booking.bookingCode}
                                                        onClick={() => handleSellerDecision(booking.bookingCode, "confirm")}
                                                    >
                                                        {t("badminton.confirm")}
                                                    </Button>
                                                </Stack>
                                            ) : (
                                                <Typography variant="caption" color="text.secondary">—</Typography>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBookingsOpen(false)} disabled={Boolean(bookingActionCode)}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default BadmintonSection;
