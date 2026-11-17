import React, { useCallback, useEffect, useState } from "react";
import {
    Alert,
    Badge,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    IconButton,
    Link,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Popover,
    Stack,
    SvgIcon,
    Typography,
} from "@mui/material";
import { pubApi } from "../api";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

const BellSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </SvgIcon>
);

const POLL_INTERVAL_MS = 60000;
const POPOVER_PREVIEW_COUNT = 5;

const truncate = (text, maxLen) => {
    if (!text) return "";
    return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
};

const formatTime = (dateStr, t) => {
    if (!dateStr) return "";
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return t("notificationBell.justNow");
        if (diffMin < 60) return t("notificationBell.minutesAgo", { count: diffMin });
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return t("notificationBell.hoursAgo", { count: diffHr });
        return d.toLocaleDateString();
    } catch {
        return dateStr;
    }
};

const statusChipColor = (status) => {
    if (status === "PAID" || status === "CONFIRMED") return "success";
    if (status === "WAITING_CONFIRM") return "warning";
    if (status === "REJECTED") return "error";
    return "default";
};

// Label / value pair of the structured payment card.
const InfoRow = ({ label, children }) => (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 104, pt: 0.25 }}>
            {label}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Stack>
);

const NotificationBell = () => {
    const { username } = useAuth();
    const [unreadCount, setUnreadCount] = useState(0);
    const [anchorEl, setAnchorEl] = useState(null);
    const [previewItems, setPreviewItems] = useState([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [actionState, setActionState] = useState({ busy: false, error: "", success: "" });
    const { t } = useTranslation();

    const fetchUnreadCount = useCallback(async () => {
        if (!username) return;
        try {
            const res = await pubApi.get("/api/v1/seller/notifications/unread-count", {
                headers: { "X-User-ID": username },
            });
            setUnreadCount(res.data?.unreadCount || 0);
        } catch (err) {
            // Silently fail - will retry on next poll
        }
    }, [username]);

    const fetchPreviewNotifications = useCallback(async () => {
        if (!username) return;
        try {
            const res = await pubApi.get("/api/v1/seller/notifications", {
                params: { page: 0, size: POPOVER_PREVIEW_COUNT },
                headers: { "X-User-ID": username },
            });
            setPreviewItems(res.data || []);
        } catch (err) {
            // Silently fail
        }
    }, [username]);

    // Poll for unread count
    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchUnreadCount]);

    const handleBellClick = async (event) => {
        setAnchorEl(event.currentTarget);
        await fetchPreviewNotifications();
    };

    const handlePopoverClose = () => {
        setAnchorEl(null);
    };

    const handleNotificationClick = async (notification) => {
        setAnchorEl(null);
        setSelectedNotification(notification);
        setActionState({ busy: false, error: "", success: "" });
        setDialogOpen(true);
        try {
            const res = await pubApi.get(`/api/v1/seller/notifications/${notification.id}`, {
                headers: { "X-User-ID": username },
            });
            setSelectedNotification(res.data);
            fetchUnreadCount();
        } catch (err) {
            console.error("Failed to load notification detail", err);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await pubApi.post("/api/v1/seller/notifications/read-all", null, {
                headers: { "X-User-ID": username },
            });
            setUnreadCount(0);
            setPreviewItems((prev) => prev.map((item) => ({ ...item, read: true })));
        } catch (err) {
            console.error("Failed to mark all as read", err);
        }
    };

    const handleDialogClose = () => {
        setDialogOpen(false);
        setSelectedNotification(null);
        setActionState({ busy: false, error: "", success: "" });
    };

    /**
     * Admin received the money: the payment behind the notification goes to PAID
     * and its plan is activated, without leaving the notification. The detail is
     * reloaded afterwards so the card shows the new status.
     */
    const handleMarkPaid = async () => {
        const planUserCode = selectedNotification?.payment?.planUserCode;
        if (!planUserCode) return;

        setActionState({ busy: true, error: "", success: "" });
        try {
            await pubApi.post(
                "/admin/v1/paymentPlan/payment/markPaid",
                {
                    planUserCodes: [planUserCode],
                    note: t("notificationBell.payment.billNote"),
                    activeDate: null,
                },
                { headers: { "X-User-ID": username } }
            );
        } catch (err) {
            setActionState({
                busy: false,
                success: "",
                error: err?.response?.data?.errorMessage || t("notificationBell.payment.markPaidFailed"),
            });
            return;
        }

        // The payment went to PAID server-side; reload the detail so the card
        // shows the stored status, and keep the local one if the reload fails.
        setSelectedNotification((prev) =>
            prev && prev.payment
                ? { ...prev, payment: { ...prev.payment, status: "PAID" } }
                : prev
        );
        setActionState({ busy: false, error: "", success: t("notificationBell.payment.markPaidSuccess") });
        fetchUnreadCount();
        try {
            const res = await pubApi.get(`/api/v1/seller/notifications/${selectedNotification.id}`, {
                headers: { "X-User-ID": username },
            });
            setSelectedNotification(res.data);
        } catch (err) {
            console.error("Failed to reload notification detail", err);
        }
    };

    // A payment notification carries the record it is about, so the dialog
    // renders that record instead of only the message text.
    const payment = selectedNotification?.payment;
    const paymentContact = [payment?.sellerEmail, payment?.sellerPhone]
        .filter(Boolean)
        .join(" / ");

    return (
        <>
            <IconButton
                onClick={handleBellClick}
                size="small"
                aria-label={t("notificationBell.notifications")}
                title={t("notificationBell.notifications")}
            >
                <Badge badgeContent={unreadCount > 0 ? unreadCount : 0} color="error">
                    <BellSvgIcon />
                </Badge>
            </IconButton>

            {/* Popover Preview */}
            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={handlePopoverClose}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{
                    paper: {
                        sx: { width: { xs: 320, sm: 380 }, maxHeight: 420 },
                    },
                }}
            >
                <Stack sx={{ p: 2, pb: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                            {t("notificationBell.notifications")}
                        </Typography>
                        {unreadCount > 0 && (
                            <Link
                                component="button"
                                variant="caption"
                                onClick={handleMarkAllAsRead}
                                underline="hover"
                            >
                                {t("notificationBell.markAllAsRead")}
                            </Link>
                        )}
                    </Stack>
                </Stack>
                <Divider />
                <List dense disablePadding>
                    {previewItems.length === 0 ? (
                        <Box sx={{ p: 3, textAlign: "center" }}>
                            <Typography variant="body2" color="text.secondary">
                                {t("notificationBell.noNotifications")}
                            </Typography>
                        </Box>
                    ) : (
                        previewItems.map((item, idx) => (
                            <React.Fragment key={item.id || idx}>
                                {idx > 0 && <Divider />}
                                <ListItemButton
                                    onClick={() => handleNotificationClick(item)}
                                    sx={{
                                        py: 1.5,
                                        px: 2,
                                        bgcolor: item.read ? "transparent" : "action.hover",
                                    }}
                                >
                                    <ListItemText
                                        primary={
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                {!item.read && (
                                                    <Box
                                                        sx={{
                                                            width: 8,
                                                            height: 8,
                                                            borderRadius: "50%",
                                                            bgcolor: "primary.main",
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                )}
                                                <Typography
                                                    variant="body2"
                                                    sx={{
                                                        fontWeight: item.read ? 400 : 600,
                                                        flex: 1,
                                                    }}
                                                >
                                                    {truncate(item.title, 40)}
                                                </Typography>
                                            </Stack>
                                        }
                                        secondary={
                                            <Stack spacing={0.25}>
                                                <Typography variant="caption" color="text.secondary" noWrap>
                                                    {truncate(item.message, 60)}
                                                </Typography>
                                                <Stack direction="row" justifyContent="space-between">
                                                    <Typography variant="caption" color="text.disabled">
                                                        {item.senderName || t("notificationBell.admin")}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.disabled">
                                                        {formatTime(item.createdAt, t)}
                                                    </Typography>
                                                </Stack>
                                            </Stack>
                                        }
                                    />
                                </ListItemButton>
                            </React.Fragment>
                        ))
                    )}
                </List>
            </Popover>

            {/* Detail Dialog */}
            <Dialog
                open={dialogOpen}
                onClose={handleDialogClose}
                maxWidth="sm"
                fullWidth
            >
                {selectedNotification && (
                    <>
                        <DialogTitle sx={{ pb: 1 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                {!selectedNotification.read && (
                                    <Box
                                        sx={{
                                            width: 10,
                                            height: 10,
                                            borderRadius: "50%",
                                            bgcolor: "primary.main",
                                        }}
                                    />
                                )}
                                <Typography variant="h6" sx={{ flex: 1 }}>
                                    {selectedNotification.title}
                                </Typography>
                            </Stack>
                        </DialogTitle>
                        <DialogContent>
                            <Stack spacing={2}>
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Stack spacing={0.25}>
                                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                            {t("notificationBell.from")} {selectedNotification.senderName || t("notificationBell.admin")}
                                        </Typography>
                                        {selectedNotification.senderEmail && (
                                            <Typography variant="caption" color="text.secondary">
                                                {selectedNotification.senderEmail}
                                            </Typography>
                                        )}
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">
                                        {selectedNotification.createdAt &&
                                            new Date(selectedNotification.createdAt).toLocaleString()}
                                    </Typography>
                                </Stack>
                                {selectedNotification.requestUuid && (
                                    <Typography variant="caption" color="text.secondary">
                                        {t("notificationBell.environment")} {selectedNotification.requestUuid.slice(-6)}
                                    </Typography>
                                )}
                                <Divider />
                                {actionState.success && <Alert severity="success">{actionState.success}</Alert>}
                                {actionState.error && <Alert severity="error">{actionState.error}</Alert>}
                                {payment ? (
                                    <Paper variant="outlined" sx={{ p: 2 }}>
                                        <Stack spacing={1.25}>
                                            <Stack
                                                direction="row"
                                                justifyContent="space-between"
                                                alignItems="center"
                                                spacing={1}
                                            >
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    {[payment.amount, payment.currency].filter(Boolean).join(" ")}
                                                </Typography>
                                                <Chip
                                                    size="small"
                                                    color={statusChipColor(payment.status)}
                                                    label={t(`notificationBell.paymentStatus.${payment.status}`, {
                                                        defaultValue: payment.status,
                                                    })}
                                                />
                                            </Stack>
                                            <Divider />
                                            <InfoRow label={t("notificationBell.payment.seller")}>
                                                <Typography variant="body2">
                                                    {payment.sellerUsername || "\u2014"}
                                                </Typography>
                                            </InfoRow>
                                            <InfoRow label={t("notificationBell.payment.plan")}>
                                                <Typography variant="body2">
                                                    {payment.planDescription || "\u2014"}
                                                </Typography>
                                            </InfoRow>
                                            {payment.extendDays != null && (
                                                <InfoRow label={t("notificationBell.payment.extension")}>
                                                    <Typography variant="body2">
                                                        {t("notificationBell.payment.days", { count: payment.extendDays })}
                                                    </Typography>
                                                </InfoRow>
                                            )}
                                            <InfoRow label={t("notificationBell.payment.contact")}>
                                                <Typography variant="body2">
                                                    {paymentContact || t("notificationBell.payment.noContact")}
                                                </Typography>
                                            </InfoRow>
                                            <InfoRow label={t("notificationBell.payment.code")}>
                                                <Typography
                                                    variant="caption"
                                                    sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
                                                >
                                                    {payment.paymentCode}
                                                </Typography>
                                            </InfoRow>
                                        </Stack>
                                    </Paper>
                                ) : (
                                    <Typography variant="body1" sx={{ whiteSpace: "pre-wrap" }}>
                                        {selectedNotification.message}
                                    </Typography>
                                )}
                            </Stack>
                        </DialogContent>
                        <DialogActions sx={{ px: 3, pb: 2 }}>
                            <Button onClick={handleDialogClose}>{t("notificationBell.payment.close")}</Button>
                            {payment && (
                                <Button
                                    variant="contained"
                                    color="success"
                                    disabled={
                                        actionState.busy ||
                                        payment.status === "PAID" ||
                                        payment.status === "REJECTED"
                                    }
                                    onClick={handleMarkPaid}
                                    startIcon={actionState.busy ? <CircularProgress size={16} color="inherit" /> : null}
                                >
                                    {actionState.busy
                                        ? t("notificationBell.payment.markingPaid")
                                        : t("notificationBell.payment.markPaid")}
                                </Button>
                            )}
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </>
    );
};

export default NotificationBell;
