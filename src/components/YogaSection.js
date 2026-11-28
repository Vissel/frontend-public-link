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
    Menu,
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
import { alpha } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import { pubApi } from "../api";
import { useAuth } from "../AuthContext";
import {
    addDays,
    currentHour,
    hourLabel,
    isoWeekday,
    shortDate,
    todayIso,
    weekDates,
} from "../util/yoga";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const YOGA = "/api/v1/publish/yoga";
const SELLER = "/api/v1/yoga/seller";
// The grid shows a fixed 7-row window of hours that scrolls vertically through
// all 24 hours and opens on the hours that actually hold classes; 7 day-columns
// scroll horizontally.
const ROW_HEIGHT = 64;
const HEADER_HEIGHT = 56;
const VISIBLE_HOURS = 7;
const MAX_ROW = HOURS.length - VISIBLE_HOURS;
const SPOTLIGHT_MS = 1800;

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

    // copy class (seller, desktop right-click on a calendar cell). copyMenu
    // holds the cursor position plus the occurrence under the cursor.
    const [copyMenu, setCopyMenu] = useState(null);
    const [copyOpen, setCopyOpen] = useState(false);
    const [copySource, setCopySource] = useState(null);
    const [copyTargets, setCopyTargets] = useState([]);
    const [copyInfo, setCopyInfo] = useState({ title: "", coach: "" });
    const [copySubmitting, setCopySubmitting] = useState(false);

    // booking dialog
    const [bookOpen, setBookOpen] = useState(false);
    const [bookOccurrence, setBookOccurrence] = useState(null);
    const [bookForm, setBookForm] = useState({ buyerName: "", buyerUsername: "", paymentMode: "" });
    const [plans, setPlans] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    // seller: registered buyers of the clicked occurrence
    const [attendeesOpen, setAttendeesOpen] = useState(false);
    const [attendeesOccurrence, setAttendeesOccurrence] = useState(null);
    const [attendees, setAttendees] = useState([]);
    const [attendeesLoading, setAttendeesLoading] = useState(false);
    const [attendeeBusy, setAttendeeBusy] = useState("");

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

    // The visible week's occurrences, earliest first. This drives the opening
    // scroll position and the "next class" strip, so the screen never lands on
    // empty hours while classes sit a scroll away.
    const weekOccurrences = useMemo(() => {
        const items = data?.items || [];
        return [...items].sort((a, b) => (a.date === b.date
            ? (a.startTime || "").localeCompare(b.startTime || "")
            : (a.date || "").localeCompare(b.date || "")));
    }, [data]);

    const nextOccurrence = useMemo(
        () => weekOccurrences.find((occ) => !occ.past) || weekOccurrences[0] || null,
        [weekOccurrences]
    );

    const freeSlotsCount = useMemo(
        () => weekOccurrences.filter((occ) => !occ.past && occ.remaining > 0).length,
        [weekOccurrences]
    );

    // How many classes sit on each hour of the week, for the time-gutter markers.
    const hourCounts = useMemo(() => {
        const counts = {};
        weekOccurrences.forEach((occ) => {
            const hour = parseInt((occ.startTime || "0").slice(0, 2), 10);
            counts[hour] = (counts[hour] || 0) + 1;
        });
        return counts;
    }, [weekOccurrences]);

    const focusedWeekRef = useRef(null);
    const spotlightTimer = useRef(null);
    const [spotlight, setSpotlight] = useState("");

    useEffect(() => () => {
        if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
    }, []);

    /** Bring an hour to the top of the body viewport, one row of context above. */
    const focusHour = useCallback((hour, smooth) => {
        const el = scrollRef.current;
        if (!el) return;
        const row = Math.max(0, Math.min(MAX_ROW, hour - 1));
        const top = row * ROW_HEIGHT;
        if (typeof el.scrollTo === "function") {
            el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
        } else {
            el.scrollTop = top;
        }
    }, []);

    const jumpToOccurrence = (occ) => {
        if (!occ) return;
        focusHour(parseInt((occ.startTime || "0").slice(0, 2), 10), true);
        setSpotlight(`${occ.classCode}-${occ.date}`);
        if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
        spotlightTimer.current = setTimeout(() => setSpotlight(""), SPOTLIGHT_MS);
    };

    // Open on the hours that hold classes: the first still-bookable occurrence
    // of the week, else the first class, else the current hour. Runs only when
    // the week changes, so refreshing counts after a booking never yanks the
    // viewport away from what the visitor was reading.
    useEffect(() => {
        if (!data || focusedWeekRef.current === windowStart) return;
        focusedWeekRef.current = windowStart;
        const hour = nextOccurrence
            ? parseInt((nextOccurrence.startTime || "0").slice(0, 2), 10)
            : currentHour();
        focusHour(hour, false);
    }, [data, windowStart, nextOccurrence, focusHour]);

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
            await loadRange();
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
            await loadRange();
        } catch (err) {
            console.error("Delete class failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.deleteClass"));
        }
    };

    const openCopyDialog = (occurrence) => {
        setCopyMenu(null);
        setCopySource(occurrence);
        setCopyTargets([{ date: "", startTime: occurrence.startTime, endTime: occurrence.endTime }]);
        setCopyInfo({ title: occurrence.title || "", coach: occurrence.coach || "" });
        setError("");
        setCopyOpen(true);
    };

    const updateCopyTarget = (index, patch) =>
        setCopyTargets((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

    const addCopyTarget = () =>
        setCopyTargets((prev) => [
            ...prev,
            { date: "", startTime: copySource?.startTime || "", endTime: copySource?.endTime || "" },
        ]);

    const removeCopyTarget = (index) =>
        setCopyTargets((prev) => prev.filter((_, i) => i !== index));

    /**
     * Copy the class info onto every target row. The server answers with the
     * created classes plus one reason per refused row, so a partly wrong batch
     * still creates what it can and the seller sees exactly what was skipped.
     */
    const handleCopyClass = async () => {
        if (!copyInfo.title.trim()) {
            setError(t("yoga.errors.titleRequired"));
            return;
        }
        for (const row of copyTargets) {
            if (!row.date || !row.startTime || !row.endTime) {
                setError(t("yoga.copyRowsRequired"));
                return;
            }
            if (row.endTime <= row.startTime) {
                setError(t("yoga.copyTimeOrder"));
                return;
            }
        }
        setCopySubmitting(true);
        setError("");
        try {
            const res = await pubApi.post(`${SELLER}/class/copy`, {
                token,
                classCode: copySource.classCode,
                title: copyInfo.title.trim(),
                coach: copyInfo.coach.trim(),
                targets: copyTargets,
            });
            const created = res.data?.data?.created || [];
            const failed = res.data?.data?.failed || [];
            setCopyOpen(false);
            setNotice(t("yoga.copySuccess", { count: created.length }));
            if (failed.length > 0) {
                setError([
                    t("yoga.copySkipped", { count: failed.length }),
                    ...failed.map((f) => `${f.date} ${f.startTime}-${f.endTime}: ${f.reason}`),
                ].join("\n"));
            }
            await loadCalendar();
            await loadRange();
        } catch (err) {
            console.error("Copy class failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.copy"));
        } finally {
            setCopySubmitting(false);
        }
    };

    const openBook = async (occurrence) => {
        setBookOccurrence(occurrence);
        // A logged-in buyer gets their own name prefilled (the server sends the
        // account full name, falling back to the username); the seller books on
        // behalf of someone else, so their walk-in field stays empty.
        setBookForm({
            buyerName: sellerView ? "" : data?.buyerFullName || "",
            buyerUsername: "",
            paymentMode: "",
        });
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
            await loadRange();
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
            await loadRange();
        } catch (err) {
            console.error("Cancel failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.cancel"));
        }
    };

    const loadAttendees = async (occurrence) => {
        if (!token || !occurrence) return;
        setAttendeesLoading(true);
        try {
            const res = await pubApi.post(`${YOGA}/attendees`, {
                token,
                classCode: occurrence.classCode,
                date: occurrence.date,
            });
            setAttendees(res.data || []);
        } catch (err) {
            console.error("Buyer list load failed", err);
            setAttendees([]);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.loadAttendees"));
        } finally {
            setAttendeesLoading(false);
        }
    };

    const openAttendees = (occurrence) => {
        setAttendeesOccurrence(occurrence);
        setAttendees([]);
        setError("");
        setAttendeesOpen(true);
        loadAttendees(occurrence);
    };

    /** flips paid / attended, same interaction as the plain order list chips */
    const handleToggleBooking = async (booking, field) => {
        setAttendeeBusy(`${booking.bookingCode}-${field}`);
        try {
            await pubApi.post(`${SELLER}/booking/toggle`, {
                token,
                bookingCode: booking.bookingCode,
                paid: field === "paid" ? !booking.paid : booking.paid,
                attended: field === "attended" ? !booking.attended : booking.attended,
            });
            await loadAttendees(attendeesOccurrence);
        } catch (err) {
            console.error("Booking toggle failed", err);
            setError(err?.response?.data?.errorMessage || t("yoga.errors.toggle"));
        } finally {
            setAttendeeBusy("");
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
            {error && (
                <Alert severity="error" onClose={() => setError("")} sx={{ whiteSpace: "pre-line" }}>
                    {error}
                </Alert>
            )}
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
                    {data.buyerPlan.quotaType === "BOOKINGS"
                        ? t("yoga.planBannerBookings", {
                            used: data.buyerPlan.usedBookings,
                            total: data.buyerPlan.totalDays,
                            remaining: data.buyerPlan.remainingDays,
                        })
                        : t("yoga.planBanner", {
                            used: data.buyerPlan.usedDays,
                            total: data.buyerPlan.totalDays,
                            remaining: data.buyerPlan.remainingDays,
                        })}
                </Alert>
            )}
            {!sellerView && !isAuthenticated && (
                <Alert severity="info">{t("yoga.anonymousHint")}</Alert>
            )}

            {/* Week strip: proves there are classes and jumps straight to the
                next bookable one, so an empty-looking grid never sends a
                visitor away. */}
            <Box
                sx={(theme) => ({
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    flexWrap: "wrap",
                    px: 2,
                    py: 1.25,
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: alpha(theme.palette.primary.main, 0.16),
                    background: `linear-gradient(115deg, ${alpha(theme.palette.primary.main, 0.09)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
                })}
            >
                {nextOccurrence ? (
                    <>
                        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: "secondary.dark",
                                    fontWeight: 700,
                                    letterSpacing: 0.4,
                                    textTransform: "uppercase",
                                }}
                            >
                                {t("yoga.nextClass")}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {nextOccurrence.title}
                                {" · "}
                                {t(`yoga.days.${isoWeekday(nextOccurrence.date)}`)} {shortDate(nextOccurrence.date)}
                                {" · "}
                                {nextOccurrence.startTime}-{nextOccurrence.endTime}
                                {nextOccurrence.coach ? ` · ${nextOccurrence.coach}` : ""}
                            </Typography>
                        </Stack>
                        <Chip
                            size="small"
                            color={remainingColor(nextOccurrence)}
                            label={nextOccurrence.remaining <= 0
                                ? t("yoga.full")
                                : `${nextOccurrence.remaining}/${nextOccurrence.capacity}`}
                            onClick={() => { }}
                            clickable={false}
                        />
                        <Button size="small" variant="contained" onClick={() => jumpToOccurrence(nextOccurrence)}>
                            {t("yoga.goToClass")}
                        </Button>
                    </>
                ) : (
                    <>
                        <Typography variant="body2" color="text.secondary">
                            {t("yoga.noClassesThisWeek")}
                        </Typography>
                        <Button size="small" variant="outlined" onClick={() => setAnchor(addDays(anchor, 7))}>
                            {t("yoga.seeNextWeek")}
                        </Button>
                    </>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
                    {t("yoga.weekSummary", { count: weekOccurrences.length })}
                    {freeSlotsCount > 0 ? ` · ${t("yoga.weekFree", { count: freeSlotsCount })}` : ""}
                </Typography>
            </Box>

            {/* the calendar: 7 day-columns centred on today and a 7-row time
                viewport that opens on the hours holding classes, with vertical
                + horizontal scroll and a divider line on every column. */}
            <TableContainer
                ref={scrollRef}
                data-testid="yoga-grid"
                sx={(theme) => ({
                    overflow: "auto",
                    height: HEADER_HEIGHT + VISIBLE_HOURS * ROW_HEIGHT,
                    maxWidth: "100%",
                    borderRadius: 2,
                    border: "1px solid",
                    borderColor: "divider",
                    scrollbarWidth: "thin",
                    scrollbarColor: `${theme.palette.primary.main} ${alpha(theme.palette.primary.main, 0.08)}`,
                    "&::-webkit-scrollbar": { width: 10, height: 10 },
                    "&::-webkit-scrollbar-track": { background: alpha(theme.palette.primary.main, 0.06) },
                    "&::-webkit-scrollbar-thumb": {
                        background: theme.palette.primary.main,
                        borderRadius: 999,
                        border: `2px solid ${theme.palette.background.paper}`,
                    },
                    "&::-webkit-scrollbar-thumb:hover": { background: theme.palette.primary.dark },
                })}
            >
                <Table stickyHeader size="small" sx={{ minWidth: 80 + 7 * 112, tableLayout: "fixed" }}>
                    <TableHead>
                        <TableRow>
                            <TableCell
                                sx={{
                                    width: 80,
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
                                            {t(`yoga.days.${isoWeekday(iso)}`)}
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
                                        onClick={() => focusHour(hour, true)}
                                        title={hourCounts[hour]
                                            ? t("yoga.hourClasses", { count: hourCounts[hour], hour: hourLabel(hour) })
                                            : undefined}
                                        sx={{
                                            width: 80,
                                            bgcolor: isNowRow ? "action.selected" : "action.hover",
                                            fontWeight: 600,
                                            position: "sticky",
                                            left: 0,
                                            zIndex: 1,
                                            borderRight: "1px solid",
                                            borderColor: "divider",
                                            cursor: hourCounts[hour] ? "pointer" : "default",
                                        }}
                                    >
                                        <Stack direction="row" alignItems="center" spacing={0.5}>
                                            <span>{hourLabel(hour)}</span>
                                            {hourCounts[hour] ? (
                                                <Box
                                                    component="span"
                                                    sx={(theme) => ({
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        justifyContent: "center",
                                                        minWidth: 16,
                                                        height: 16,
                                                        px: 0.4,
                                                        flexShrink: 0,
                                                        borderRadius: 999,
                                                        fontSize: "0.6rem",
                                                        fontWeight: 700,
                                                        color: "common.white",
                                                        bgcolor: theme.palette.secondary.main,
                                                    })}
                                                >
                                                    {hourCounts[hour]}
                                                </Box>
                                            ) : null}
                                        </Stack>
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
                                                                    ? openAttendees(occ)
                                                                    : openBook(occ)
                                                            }
                                                            onContextMenu={(e) => {
                                                                if (!sellerView) return;
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setCopyMenu({ x: e.clientX, y: e.clientY, occurrence: occ });
                                                            }}
                                                            sx={(theme) => ({
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
                                                                transition: "transform 140ms ease, box-shadow 140ms ease",
                                                                boxShadow: spotlight === `${occ.classCode}-${occ.date}`
                                                                    ? `0 0 0 3px ${alpha(theme.palette.secondary.main, 0.6)}`
                                                                    : "none",
                                                                "&:hover": {
                                                                    transform: "translateY(-1px)",
                                                                    boxShadow: `0 6px 14px ${alpha(theme.palette.primary.dark, 0.28)}`,
                                                                },
                                                            })}
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
                                                                onClick={() => { }}
                                                                clickable={false}
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
                    <DatePicker
                        label={t("yoga.dateFrom")}
                        value={range.from ? dayjs(range.from) : null}
                        onChange={(date) => setRange((prev) => ({ ...prev, from: date ? date.format("YYYY-MM-DD") : "" }))}
                        slotProps={{ textField: { size: "small" } }}
                    />
                    <DatePicker
                        label={t("yoga.dateTo")}
                        value={range.to ? dayjs(range.to) : null}
                        onChange={(date) => setRange((prev) => ({ ...prev, to: date ? date.format("YYYY-MM-DD") : "" }))}
                        slotProps={{ textField: { size: "small" } }}
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
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                {sellerView && (
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => openAttendees(occ)}
                                                    >
                                                        {t("yoga.attendees")}
                                                    </Button>
                                                )}
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    disabled={occ.past || (occ.remaining <= 0 && !occ.myBookingCode)}
                                                    onClick={() => openBook(occ)}
                                                >
                                                    {occ.myBookingCode ? t("yoga.booked") : t("yoga.book")}
                                                </Button>
                                            </Stack>
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
                            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                                <MenuItem key={day} value={day}>{t(`yoga.days.${day}`)}</MenuItem>
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
                            {bookOccurrence?.title}
                            {" · "}
                            {bookOccurrence?.date} {bookOccurrence?.startTime}-{bookOccurrence?.endTime}
                            {bookOccurrence?.coach ? ` · ${bookOccurrence.coach}` : ""}
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
                                        {plan.buyerName} ({plan.remainingDays}{" "}
                                        {plan.quotaType === "BOOKINGS"
                                            ? t("yoga.bookingsLeft")
                                            : t("yoga.daysLeft")}
                                        )
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

            {/* seller: small right-click menu on a calendar class cell. Desktop
                only by nature; buyers never get here. */}
            <Menu
                anchorReference="anchorPosition"
                anchorPosition={copyMenu ? { top: copyMenu.y, left: copyMenu.x } : undefined}
                open={Boolean(copyMenu)}
                onClose={() => setCopyMenu(null)}
            >
                <MenuItem onClick={() => copyMenu && openCopyDialog(copyMenu.occurrence)}>
                    {t("yoga.copyClass")}
                </MenuItem>
            </Menu>

            {/* copy dialog: the class name and coach arrive pre-filled and stay
                editable, the seller picks the target dates and times. Nothing
                about buyers or bookings is copied. */}
            <Dialog
                open={copyOpen}
                onClose={copySubmitting ? undefined : () => setCopyOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>{t("yoga.copyTitle")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            {copySource?.startTime}-{copySource?.endTime}
                            {" · "}
                            {t("yoga.capacity")}: {copySource?.capacity}
                        </Typography>
                        <Stack direction="row" spacing={1}>
                            <TextField
                                size="small"
                                label={t("yoga.title")}
                                value={copyInfo.title}
                                onChange={(e) => setCopyInfo((p) => ({ ...p, title: e.target.value }))}
                                required
                            />
                            <TextField
                                size="small"
                                label={t("yoga.coach")}
                                value={copyInfo.coach}
                                onChange={(e) => setCopyInfo((p) => ({ ...p, coach: e.target.value }))}
                            />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                            {t("yoga.copyHint")}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {t("yoga.copyOverlapHint")}
                        </Typography>
                        {/* One line per target. The theme makes every TextField
                            fullWidth by default, so the fields share the line
                            through flex basis; letting them wrap instead stacked
                            them and each floating label collided with the field
                            above. */}
                        <Stack spacing={2.5}>
                            {copyTargets.map((row, index) => (
                                <Stack key={index} direction="row" spacing={1.5} alignItems="center">
                                    <DatePicker
                                        label={t("yoga.date")}
                                        value={row.date ? dayjs(row.date) : null}
                                        onChange={(date) => updateCopyTarget(index, { date: date ? date.format("YYYY-MM-DD") : "" })}
                                        slotProps={{ textField: { size: "small", sx: { flex: "1 1 42%", minWidth: 0 } } }}
                                    />
                                    <TextField
                                        size="small"
                                        type="time"
                                        label={t("yoga.start")}
                                        value={row.startTime}
                                        onChange={(e) => updateCopyTarget(index, { startTime: e.target.value })}
                                        InputLabelProps={{ shrink: true }}
                                        sx={{ flex: "1 1 26%", minWidth: 0 }}
                                    />
                                    <TextField
                                        size="small"
                                        type="time"
                                        label={t("yoga.end")}
                                        value={row.endTime}
                                        onChange={(e) => updateCopyTarget(index, { endTime: e.target.value })}
                                        InputLabelProps={{ shrink: true }}
                                        sx={{ flex: "1 1 26%", minWidth: 0 }}
                                    />
                                    <Button
                                        size="small"
                                        color="error"
                                        onClick={() => removeCopyTarget(index)}
                                        disabled={copyTargets.length === 1}
                                        sx={{ flexShrink: 0 }}
                                    >
                                        {t("common.delete")}
                                    </Button>
                                </Stack>
                            ))}
                        </Stack>
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={addCopyTarget}
                            sx={{ alignSelf: "flex-start" }}
                        >
                            {t("yoga.copyAddTarget")}
                        </Button>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCopyOpen(false)} disabled={copySubmitting}>
                        {t("common.cancel")}
                    </Button>
                    <Button onClick={handleCopyClass} variant="contained" disabled={copySubmitting}>
                        {copySubmitting ? t("common.saving") : t("yoga.copyClass")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* seller: the buyers registered for the clicked class, laid out like
                the plain product order list (paid / attended chips toggle the
                booking through the seller endpoints). */}
            <Dialog open={attendeesOpen} onClose={() => setAttendeesOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ pb: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="subtitle1" fontWeight={700}>
                            {t("yoga.attendeesTitle")}
                        </Typography>
                        {attendeesOccurrence && (
                            <Chip
                                size="small"
                                color={remainingColor(attendeesOccurrence)}
                                label={`${attendeesOccurrence.booked}/${attendeesOccurrence.capacity}`}
                            />
                        )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                        {attendeesOccurrence?.title}
                        {" · "}
                        {attendeesOccurrence?.date} {attendeesOccurrence?.startTime}-{attendeesOccurrence?.endTime}
                        {attendeesOccurrence?.coach ? ` · ${attendeesOccurrence.coach}` : ""}
                    </Typography>
                </DialogTitle>
                <DialogContent dividers>
                    <TableContainer sx={{ overflowX: "auto" }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t("yoga.buyer")}</TableCell>
                                    <TableCell>{t("yoga.paymentMode")}</TableCell>
                                    <TableCell>{t("yoga.bookedAt")}</TableCell>
                                    <TableCell>{t("yoga.paid")}</TableCell>
                                    <TableCell>{t("yoga.attended")}</TableCell>
                                    <TableCell>{t("yoga.note")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {attendeesLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center">{t("common.loading")}</TableCell>
                                    </TableRow>
                                ) : attendees.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center">{t("yoga.attendeesEmpty")}</TableCell>
                                    </TableRow>
                                ) : (
                                    attendees.map((booking) => (
                                        <TableRow key={booking.bookingCode} hover>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {booking.buyerName || booking.buyerUsername || "\u2014"}
                                                </Typography>
                                                {booking.buyerName && booking.buyerUsername && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        {booking.buyerUsername}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {booking.paymentMode === "PLAN"
                                                    ? t("yoga.payWithPlan")
                                                    : t("yoga.payAsYouGo")}
                                            </TableCell>
                                            <TableCell>{booking.bookedAt || "\u2014"}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={booking.paid ? t("common.yes") : t("common.no")}
                                                    size="small"
                                                    color={booking.paid ? "success" : "default"}
                                                    clickable
                                                    disabled={Boolean(attendeeBusy)}
                                                    onClick={() => handleToggleBooking(booking, "paid")}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={booking.attended ? t("common.yes") : t("common.no")}
                                                    size="small"
                                                    color={booking.attended ? "success" : "default"}
                                                    clickable
                                                    disabled={Boolean(attendeeBusy)}
                                                    onClick={() => handleToggleBooking(booking, "attended")}
                                                />
                                            </TableCell>
                                            <TableCell>{booking.note || "\u2014"}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            const occ = attendeesOccurrence;
                            setAttendeesOpen(false);
                            if (occ) openEditor(occ.dayOfWeek, parseInt((occ.startTime || "0").slice(0, 2), 10), occ);
                        }}
                    >
                        {t("yoga.editClass")}
                    </Button>
                    <Button
                        onClick={() => {
                            const occ = attendeesOccurrence;
                            setAttendeesOpen(false);
                            if (occ) openBook(occ);
                        }}
                    >
                        {t("yoga.book")}
                    </Button>
                    <Button variant="contained" onClick={() => setAttendeesOpen(false)}>
                        {t("common.close")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default YogaSection;
