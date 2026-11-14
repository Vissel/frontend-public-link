import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
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
import { useTranslation } from "react-i18next";
import { pubApi } from "../api";
import { useAuth } from "../AuthContext";
import {
    ISO_WEEKDAYS,
    addDays,
    currentHour,
    hourLabel,
    isoWeekday,
    shortDate,
    todayIso,
    weekDates,
    weekdayLabel,
} from "../util/yoga";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const YOGA = "/api/v1/publish/yoga";
const SELLER = "/api/v1/yoga/seller";
// The grid shows a fixed 5-row window of hours that scrolls vertically through
// all 24 hours, centred on the current hour; 7 day-columns scroll horizontally.
const ROW_HEIGHT = 64;
const VISIBLE_HOURS = 5;

/**
 * The single yoga screen: a weekly Mon..Sun grid over the 24h clock with the
 * concrete dates in the header, plus the below-calendar occurrence list with a
 * date from/to filter. Sellers edit classes inline; buyers (anonymous or
 * plan-holders) book slots. All data comes from the publish/yoga endpoints.
 */
const YogaSection = ({ token }) => {
    const { t } = useTranslation();
    const { isAuthenticated } = useAuth();

    const [anchor, setAnchor] = useState(() => todayIso());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const scrollRef = useRef(null);

    // class editor (seller)
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorDraft, setEditorDraft] = useState(null);
    const [savingClass, setSavingClass] = useState(false);

    // booking dialog
    const [bookOpen, setBookOpen] = useState(false);
    const [bookOccurrence, setBookOccurrence] = useState(null);
    const [bookForm, setBookForm] = useState({ buyerName: "", buyerUsername: "", paymentMode: "" });
    const [plans, setPlans] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    // below-calendar list
    const [range, setRange] = useState({ from: addDays(todayIso(), -3), to: addDays(todayIso(), 3) });
    const [rangeItems, setRangeItems] = useState([]);

    const sellerView = Boolean(data?.sellerView);
    // The 7 visible columns are centred on the anchor day (today by default),
    // so the window starts 3 days before it.
    const windowStart = addDays(anchor, -3);

    const loadCalendar = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError("");
        try {
            const res = await pubApi.post(`${YOGA}/calendar`, { token, weekStart: windowStart });
            setData(res.data);
        } catch (err) {
            console.error("Calendar load failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.load"));
        } finally {
            setLoading(false);
        }
    }, [token, windowStart, t]);

    useEffect(() => {
        loadCalendar();
    }, [loadCalendar]);

    // Keep the current hour as the middle of the 5-row viewport after each load.
    useEffect(() => {
        const el = scrollRef.current;
        if (el) {
            const target = Math.max(0, (currentHour() - Math.floor(VISIBLE_HOURS / 2)) * ROW_HEIGHT);
            el.scrollTop = target;
        }
    }, [data, anchor]);

    const loadRange = async () => {
        if (!token || !range.from || !range.to) return;
        setError("");
        try {
            const res = await pubApi.post(`${YOGA}/classes`, {
                token,
                fromDate: range.from,
                toDate: range.to,
            });
            setRangeItems(res.data?.items || []);
        } catch (err) {
            console.error("Class list load failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.load"));
        }
    };

    // grid cells: occurrences grouped by (dayOfWeek, hour)
    const cellMap = useMemo(() => {
        const map = {};
        (data?.items || []).forEach((occ) => {
            const hour = parseInt((occ.startTime || "0").slice(0, 2), 10);
            const key = `${occ.dayOfWeek}-${hour}`;
            if (!map[key]) map[key] = [];
            map[key].push(occ);
        });
        return map;
    }, [data]);

    const dates = weekDates(windowStart);

    const openEditor = (dayOfWeek, hour, occurrence) => {
        setEditorDraft({
            classCode: occurrence?.classCode || "",
            dayOfWeek,
            startTime: occurrence?.startTime || hourLabel(hour),
            endTime: occurrence?.endTime || hourLabel(Math.min(hour + 1, 23)),
            title: occurrence?.title || "",
            coach: occurrence?.coach || "",
            capacity: occurrence?.capacity ?? 1,
        });
        setEditorOpen(true);
    };

    const handleSaveClass = async () => {
        if (!editorDraft.title.trim()) {
            setError(t("yoga.errors.titleRequired"));
            return;
        }
        setSavingClass(true);
        setError("");
        try {
            await pubApi.post(`${SELLER}/class/upsert`, {
                token,
                classCode: editorDraft.classCode || undefined,
                dayOfWeek: Number(editorDraft.dayOfWeek),
                startTime: editorDraft.startTime,
                endTime: editorDraft.endTime,
                title: editorDraft.title.trim(),
                coach: editorDraft.coach.trim(),
                capacity: Number(editorDraft.capacity),
            });
            setEditorOpen(false);
            setNotice(t("yoga.success.classSaved"));
            await loadCalendar();
        } catch (err) {
            console.error("Save class failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.saveClass"));
        } finally {
            setSavingClass(false);
        }
    };

    const handleDeleteClass = async (classCode) => {
        try {
            await pubApi.post(`${SELLER}/class/delete`, null, {
                params: { token, classCode },
            });
            setNotice(t("yoga.success.classDeleted"));
            await loadCalendar();
        } catch (err) {
            console.error("Delete class failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.deleteClass"));
        }
    };

    const openBook = async (occurrence) => {
        setBookOccurrence(occurrence);
        setBookForm({ buyerName: "", buyerUsername: "", paymentMode: "" });
        setError("");
        if (sellerView) {
            try {
                const res = await pubApi.get(`${SELLER}/plan/list`, { params: { token } });
                setPlans(res.data || []);
            } catch (err) {
                console.error("Plan list failed", err);
                setPlans([]);
            }
        }
        setBookOpen(true);
    };

    const handleBook = async () => {
        setSubmitting(true);
        setError("");
        try {
            const payload = {
                token,
                classCode: bookOccurrence.classCode,
                date: bookOccurrence.date,
            };
            if (sellerView) {
                if (bookForm.buyerUsername) {
                    payload.buyerUsername = bookForm.buyerUsername;
                } else {
                    payload.buyerName = bookForm.buyerName;
                }
            } else {
                payload.buyerName = bookForm.buyerName;
                if (data?.buyerPlan && bookForm.paymentMode) {
                    payload.paymentMode = bookForm.paymentMode;
                }
            }
            await pubApi.post(`${YOGA}/book`, payload);
            setBookOpen(false);
            setNotice(t("yoga.success.booked"));
            await loadCalendar();
        } catch (err) {
            console.error("Booking failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.book"));
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancel = async (bookingCode) => {
        try {
            await pubApi.post(`${YOGA}/cancel`, { token, bookingCode });
            setNotice(t("yoga.success.cancelled"));
            await loadCalendar();
        } catch (err) {
            console.error("Cancel failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.cancel"));
        }
    };

    const remainingColor = (occ) => {
        if (occ.past) return "default";
        if (occ.remaining <= 0) return "error";
        if (occ.remaining <= 2) return "warning";
        return "success";
    };

    return (
        <Stack spacing={2}>
            {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}

            {/* week navigation: shifts the today-centred window by whole weeks */}
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Button size="small" variant="outlined" onClick={() => setAnchor(addDays(anchor, -7))}>
                    {t("yoga.prevWeek")}
                </Button>
                <Button size="small" variant="outlined" onClick={() => setAnchor(todayIso())}>
                    {t("yoga.thisWeek")}
                </Button>
                <Button size="small" variant="outlined" onClick={() => setAnchor(addDays(anchor, 7))}>
                    {t("yoga.nextWeek")}
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
                    {shortDate(windowStart)} – {shortDate(addDays(windowStart, 6))}
                </Typography>
            </Stack>

            {data?.buyerPlan && !sellerView && (
                <Alert severity="info">
                    {t("yoga.planBanner", {
                        used: data.buyerPlan.usedDays,
                        total: data.buyerPlan.totalDays,
                        remaining: data.buyerPlan.remainingDays,
                    })}
                </Alert>
            )}
            {!sellerView && !isAuthenticated && (
                <Alert severity="info">{t("yoga.anonymousHint")}</Alert>
            )}

            {/* the calendar: 7 day-columns centred on today, a 5-row time
                viewport centred on the current hour, with vertical + horizontal
                scroll and a divider line on every column. */}
            <TableContainer
                ref={scrollRef}
                sx={{ overflow: "auto", height: 56 + VISIBLE_HOURS * ROW_HEIGHT, maxWidth: "100%" }}
            >
                <Table stickyHeader size="small" sx={{ minWidth: 72 + 7 * 112, tableLayout: "fixed" }}>
                    <TableHead>
                        <TableRow>
                            <TableCell
                                sx={{
                                    width: 72,
                                    bgcolor: "primary.main",
                                    position: "sticky",
                                    left: 0,
                                    zIndex: 3,
                                    borderRight: "1px solid",
                                    borderColor: "rgba(255,255,255,0.35)",
                                }}
                            >
                                <Typography variant="caption" sx={{ color: "white" }}>
                                    {t("yoga.time")}
                                </Typography>
                            </TableCell>
                            {dates.map((iso) => {
                                const isToday = iso === todayIso();
                                return (
                                    <TableCell
                                        key={iso}
                                        align="center"
                                        sx={{
                                            width: 112,
                                            bgcolor: isToday ? "secondary.main" : "primary.main",
                                            borderRight: "1px solid",
                                            borderColor: "rgba(255,255,255,0.35)",
                                        }}
                                    >
                                        <Typography variant="subtitle2" sx={{ color: "white", fontWeight: 700 }}>
                                            {weekdayLabel(iso)}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: "white" }}>
                                            {shortDate(iso)}
                                        </Typography>
                                    </TableCell>
                                );
                            })}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {HOURS.map((hour) => {
                            const isNowRow = hour === currentHour();
                            return (
                                <TableRow key={hour} sx={{ height: ROW_HEIGHT }}>
                                    <TableCell
                                        sx={{
                                            width: 72,
                                            bgcolor: isNowRow ? "action.selected" : "action.hover",
                                            fontWeight: 600,
                                            position: "sticky",
                                            left: 0,
                                            zIndex: 1,
                                            borderRight: "1px solid",
                                            borderColor: "divider",
                                        }}
                                    >
                                        {hourLabel(hour)}
                                    </TableCell>
                                    {dates.map((iso) => {
                                        const dayOfWeek = isoWeekday(iso);
                                        const cellOccurrences = cellMap[`${dayOfWeek}-${hour}`] || [];
                                        const isToday = iso === todayIso();
                                        return (
                                            <TableCell
                                                key={iso}
                                                sx={{
                                                    width: 112,
                                                    height: ROW_HEIGHT,
                                                    p: 0.5,
                                                    verticalAlign: "top",
                                                    borderRight: "1px solid",
                                                    borderColor: "divider",
                                                    bgcolor: isNowRow && isToday
                                                        ? "action.selected"
                                                        : isToday
                                                            ? "action.hover"
                                                            : "transparent",
                                                }}
                                                onClick={() => {
                                                    if (sellerView && cellOccurrences.length === 0) {
                                                        openEditor(dayOfWeek, hour, null);
                                                    }
                                                }}
                                            >
                                                <Stack spacing={0.5}>
                                                    {cellOccurrences.map((occ) => (
                                                        <Box
                                                            key={`${occ.classCode}-${occ.date}`}
                                                            onClick={() =>
                                                                sellerView
                                                                    ? openEditor(dayOfWeek, hour, occ)
                                                                    : openBook(occ)
                                                            }
                                                            sx={{
                                                                cursor: "pointer",
                                                                p: 0.5,
                                                                borderRadius: 1,
                                                                border: "1px solid",
                                                                borderColor: occ.myBookingCode
                                                                    ? "success.main"
                                                                    : "divider",
                                                                bgcolor: occ.past
                                                                    ? "action.disabledBackground"
                                                                    : occ.remaining <= 0
                                                                        ? "error.light"
                                                                        : "primary.light",
                                                                color: occ.past || occ.remaining <= 0
                                                                    ? "common.white"
                                                                    : "primary.contrastText",
                                                                minHeight: 34,
                                                            }}
                                                        >
                                                            <Typography variant="caption" sx={{ display: "block", fontWeight: 700 }}>
                                                                {occ.title}
                                                            </Typography>
                                                            <Typography variant="caption" sx={{ display: "block" }}>
                                                                {occ.startTime}-{occ.endTime}
                                                                {occ.coach ? ` · ${occ.coach}` : ""}
                                                            </Typography>
                                                            <Chip
                                                                size="small"
                                                                color={remainingColor(occ)}
                                                                label={occ.remaining <= 0
                                                                    ? t("yoga.full")
                                                                    : `${occ.remaining}/${occ.capacity}`}
                                                                sx={{ mt: 0.25, height: 18, fontSize: "0.65rem" }}
                                                            />
                                                            {occ.myBookingCode && (
                                                                <Button
                                                                    size="small"
                                                                    color="error"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleCancel(occ.myBookingCode);
                                                                    }}
                                                                >
                                                                    {t("yoga.cancel")}
                                                                </Button>
                                                            )}
                                                        </Box>
                                                    ))}
                                                </Stack>
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* below-calendar occurrence list with date filter */}
            <Box>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                    {t("yoga.classListTitle")}
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 1.5 }}>
                    <TextField
                        size="small"
                        type="date"
                        label={t("yoga.dateFrom")}
                        value={range.from}
                        onChange={(e) => setRange((prev) => ({ ...prev, from: e.target.value }))}
                        InputLabelProps={{ shrink: true }}
                    />
                    <TextField
                        size="small"
                        type="date"
                        label={t("yoga.dateTo")}
                        value={range.to}
                        onChange={(e) => setRange((prev) => ({ ...prev, to: e.target.value }))}
                        InputLabelProps={{ shrink: true }}
                    />
                    <Button size="small" variant="contained" onClick={loadRange} sx={{ alignSelf: "flex-start" }}>
                        {t("yoga.filter")}
                    </Button>
                </Stack>
                <TableContainer sx={{ overflowX: "auto" }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t("yoga.date")}</TableCell>
                                <TableCell>{t("yoga.class")}</TableCell>
                                <TableCell>{t("yoga.time")}</TableCell>
                                <TableCell>{t("yoga.coach")}</TableCell>
                                <TableCell align="center">{t("yoga.remaining")}</TableCell>
                                <TableCell align="right">{t("yoga.action")}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rangeItems.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">
                                        {loading ? t("common.loading") : t("yoga.noClasses")}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rangeItems.map((occ) => (
                                    <TableRow key={`${occ.classCode}-${occ.date}`}>
                                        <TableCell>{occ.date}</TableCell>
                                        <TableCell>{occ.title}</TableCell>
                                        <TableCell>{occ.startTime}-{occ.endTime}</TableCell>
                                        <TableCell>{occ.coach || "—"}</TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                size="small"
                                                color={remainingColor(occ)}
                                                label={occ.remaining <= 0
                                                    ? t("yoga.full")
                                                    : `${occ.remaining}/${occ.capacity}`}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                disabled={occ.past || (occ.remaining <= 0 && !occ.myBookingCode)}
                                                onClick={() => openBook(occ)}
                                            >
                                                {occ.myBookingCode ? t("yoga.booked") : t("yoga.book")}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>

            {/* class editor dialog (seller) */}
            <Dialog open={editorOpen} onClose={savingClass ? undefined : () => setEditorOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>
                    {editorDraft?.classCode ? t("yoga.editClass") : t("yoga.newClass")}
                </DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <TextField
                            label={t("yoga.title")}
                            value={editorDraft?.title || ""}
                            onChange={(e) => setEditorDraft((p) => ({ ...p, title: e.target.value }))}
                            fullWidth
                            required
                        />
                        <TextField
                            label={t("yoga.coach")}
                            value={editorDraft?.coach || ""}
                            onChange={(e) => setEditorDraft((p) => ({ ...p, coach: e.target.value }))}
                            fullWidth
                        />
                        <TextField
                            select
                            label={t("yoga.day")}
                            value={editorDraft?.dayOfWeek || 1}
                            onChange={(e) => setEditorDraft((p) => ({ ...p, dayOfWeek: e.target.value }))}
                            fullWidth
                        >
                            {ISO_WEEKDAYS.map((label, idx) => (
                                <MenuItem key={label} value={idx + 1}>{label}</MenuItem>
                            ))}
                        </TextField>
                        <Stack direction="row" spacing={1}>
                            <TextField
                                type="time"
                                label={t("yoga.start")}
                                value={editorDraft?.startTime || ""}
                                onChange={(e) => setEditorDraft((p) => ({ ...p, startTime: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                            <TextField
                                type="time"
                                label={t("yoga.end")}
                                value={editorDraft?.endTime || ""}
                                onChange={(e) => setEditorDraft((p) => ({ ...p, endTime: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                            />
                        </Stack>
                        <TextField
                            type="number"
                            label={t("yoga.capacity")}
                            value={editorDraft?.capacity ?? 1}
                            onChange={(e) => setEditorDraft((p) => ({ ...p, capacity: e.target.value }))}
                            inputProps={{ min: 1 }}
                            fullWidth
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    {editorDraft?.classCode ? (
                        <Button color="error" onClick={() => { handleDeleteClass(editorDraft.classCode); setEditorOpen(false); }}>
                            {t("common.delete")}
                        </Button>
                    ) : null}
                    <Button onClick={() => setEditorOpen(false)} disabled={savingClass}>{t("common.cancel")}</Button>
                    <Button onClick={handleSaveClass} variant="contained" disabled={savingClass}>
                        {savingClass ? t("common.saving") : t("common.save")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* booking dialog */}
            <Dialog open={bookOpen} onClose={submitting ? undefined : () => setBookOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t("yoga.bookTitle")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            {bookOccurrence?.title} · {bookOccurrence?.date} {bookOccurrence?.startTime}-{bookOccurrence?.endTime}
                        </Typography>
                        {sellerView ? (
                            <TextField
                                select
                                label={t("yoga.bookFor")}
                                value={bookForm.buyerUsername}
                                onChange={(e) => setBookForm((p) => ({ ...p, buyerUsername: e.target.value, buyerName: "" }))}
                                fullWidth
                            >
                                <MenuItem value="">
                                    <em>{t("yoga.walkIn")}</em>
                                </MenuItem>
                                {plans.map((plan) => (
                                    <MenuItem key={plan.buyerUsername} value={plan.buyerUsername}>
                                        {plan.buyerName} ({plan.remainingDays} {t("yoga.daysLeft")})
                                    </MenuItem>
                                ))}
                            </TextField>
                        ) : null}
                        {(bookForm.buyerUsername === "" || !sellerView) && (
                            <TextField
                                label={t("yoga.buyerName")}
                                value={bookForm.buyerName}
                                onChange={(e) => setBookForm((p) => ({ ...p, buyerName: e.target.value }))}
                                fullWidth
                                required={!sellerView}
                            />
                        )}
                        {!sellerView && data?.buyerPlan && (
                            <TextField
                                select
                                label={t("yoga.paymentMode")}
                                value={bookForm.paymentMode}
                                onChange={(e) => setBookForm((p) => ({ ...p, paymentMode: e.target.value }))}
                                fullWidth
                            >
                                <MenuItem value="">{t("yoga.payWithPlan")}</MenuItem>
                                <MenuItem value="PAY_AS_YOU_GO">{t("yoga.payAsYouGo")}</MenuItem>
                            </TextField>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBookOpen(false)} disabled={submitting}>{t("common.cancel")}</Button>
                    <Button onClick={handleBook} variant="contained" disabled={submitting}>
                        {submitting ? t("yoga.booking") : t("yoga.book")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default YogaSection;
