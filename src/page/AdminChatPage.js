import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Avatar,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    IconButton,
    InputAdornment,
    List,
    ListItemButton,
    Paper,
    Stack,
    SvgIcon,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    beginZaloConsent,
    closeAdminConversation,
    fetchAdminConversations,
    fetchAdminHistory,
    fetchZaloStatus,
    sendAdminReply,
    sendAdminTyping,
} from "../api/chatApi";
import { isStreamConnected, subscribeAdminStream } from "../util/chatStream";
import { colorFromString, initialsOf } from "../util/avatar";
import { disablePush, enablePush, getPushState } from "../util/push";

// The stream carries everything; this timer only runs while it is down, so a
// dead connection degrades to a slow inbox instead of a silent one.
const FALLBACK_POLL_MS = 15000;
const TYPING_BEACON_MS = 3000;
// Viewport minus header (80) and footer (~90): the console is a two-pane app
// window, not a scrolling page, which is what makes it feel like WhatsApp Web.
const PANE_HEIGHT = "calc(100dvh - 190px)";

const SearchSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19zm-6 0A7 7 0 119.5 4 7 7 0 019.5 14z" />
    </SvgIcon>
);

const SendSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </SvgIcon>
);

const BackSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20z" />
    </SvgIcon>
);

const CloseSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
    </SvgIcon>
);

const BellSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1z" />
    </SvgIcon>
);

const BellOffSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M3.27 3L2 4.27l6.06 6.06V13c0 1.66 1.33 3 2.99 3 .61 0 1.17-.18 1.64-.49l2.07 2.07c-1.08.61-2.33.95-3.66.95-2.76 0-5.5-1.29-6.1-3.75L2 11v-.18L3.27 3zM21.8 22.8L20.6 24l-3.08-3.08c-1.08.61-2.33.95-3.67.95-2.76 0-5.5-1.29-6.1-3.75L2 17v-1l5.27-5.27L3 1.2 4.27 0l17.53 17.53zM14 8.83V4c0-.83-.67-1.5-1.5-1.5S11 3.17 11 4v.17l3 3.66z" />
    </SvgIcon>
);

const CheckSvgIcon = ({ double, ...props }) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        {double ? (
            <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z" />
        ) : (
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        )}
    </SvgIcon>
);

const clockOf = (iso) => {
    if (!iso) return "";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const dayKeyOf = (iso) => (iso ? new Date(iso).toDateString() : "");

const dayLabelOf = (iso, t) => {
    if (!iso) return "";
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    if (date.toDateString() === today.toDateString()) return t("adminChat.today");
    if (date.toDateString() === yesterday.toDateString()) return t("adminChat.yesterday");
    return date.toLocaleDateString();
};

/** Short list timestamp, WhatsApp style: time today, "Yesterday" or a date. */
const listTimeOf = (iso, t) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return clockOf(iso);
    const yesterday = new Date(today.getTime() - 86400000);
    if (date.toDateString() === yesterday.toDateString()) return t("adminChat.yesterday");
    return date.toLocaleDateString();
};

/**
 * Who the thread belongs to: the account's human name when known, its username
 * otherwise, and only a device tag for genuinely anonymous visitors. Showing
 * "Guest #0001" for a signed-in customer hid who was actually writing.
 */
const threadTitleOf = (conversation, t) => {
    if (!conversation) return "";
    return (
        conversation.ownerDisplayName ||
        conversation.ownerUsername ||
        `${t("adminChat.guestLabel")} #${conversation.clientTag || "????"}`
    );
};

/** Tick ladder of an administrator message: sent, delivered, seen. */
const DeliveryTicks = ({ status }) => {
    const { t } = useTranslation();
    if (status === "PENDING") return <CircularProgress size={10} sx={{ ml: 0.5 }} />;
    if (status === "FAILED") {
        return (
            <Typography variant="caption" color="error.main" sx={{ ml: 0.5 }}>
                !
            </Typography>
        );
    }
    if (status === "SENT") {
        return (
            <Tooltip title={t("chat.status.sentHint")}>
                <CheckSvgIcon sx={{ width: 14, height: 14, ml: 0.5, opacity: 0.7 }} />
            </Tooltip>
        );
    }
    const seen = status === "SEEN" || status === "REPLIED";
    return (
        <Tooltip title={seen ? t("chat.status.seenHint") : t("chat.status.deliveredHint")}>
            <CheckSvgIcon
                double
                sx={{ width: 14, height: 14, ml: 0.5, color: seen ? "#4fc3f7" : "inherit", opacity: seen ? 1 : 0.7 }}
            />
        </Tooltip>
    );
};

/**
 * Administrator chat console, laid out like WhatsApp Web: the thread list on
 * the left, the conversation on the right, one live stream behind both.
 *
 * Replies written here are mirrored into the Zalo thread when the bridge is on,
 * so the two surfaces never diverge. With the bridge off (the shipped default)
 * this is the whole support channel.
 */
const AdminChatPage = () => {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();

    const [conversations, setConversations] = useState([]);
    const [selectedUuid, setSelectedUuid] = useState(searchParams.get("c") || "");
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [search, setSearch] = useState("");
    const [zalo, setZalo] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [notice, setNotice] = useState("");
    const [consentUrl, setConsentUrl] = useState("");
    const [typingPeers, setTypingPeers] = useState({});
    const [presence, setPresence] = useState({});
    const [pendingJump, setPendingJump] = useState(0);
    const [pushOn, setPushOn] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);

    const threadRef = useRef(null);
    const selectedRef = useRef(selectedUuid);
    const typingTimerRef = useRef(0);
    const stickToBottomRef = useRef(true);

    useEffect(() => {
        selectedRef.current = selectedUuid;
    }, [selectedUuid]);

    const loadConversations = useCallback(async () => {
        try {
            const { data } = await fetchAdminConversations({ page: 0, size: 50 });
            const list = data.conversations || [];
            setConversations(list);
            setLoadError("");
            return list;
        } catch (error) {
            setLoadError(error?.response?.data?.message || t("adminChat.errors.loadFailed"));
            return [];
        }
    }, [t]);

    const loadHistory = useCallback(
        async (uuid) => {
            if (!uuid) {
                setMessages([]);
                return;
            }
            try {
                const { data } = await fetchAdminHistory(uuid);
                // A slow response for a thread that was switched away is dropped.
                if (selectedRef.current === uuid) setMessages(data.messages || []);
            } catch (error) {
                setLoadError(error?.response?.data?.message || t("adminChat.errors.loadFailed"));
            }
        },
        [t],
    );

    const loadZaloStatus = useCallback(async () => {
        try {
            const { data } = await fetchZaloStatus();
            setZalo(data);
        } catch {
            setZalo(null);
        }
    }, []);

    useEffect(() => {
        loadConversations();
        loadZaloStatus();
        getPushState().then((state) => setPushOn(state === "subscribed"));
    }, [loadConversations, loadZaloStatus]);

    useEffect(() => {
        loadHistory(selectedUuid);
    }, [selectedUuid, loadHistory]);

    // Deep link from a notification: keep the URL and the selection in step.
    useEffect(() => {
        const fromUrl = searchParams.get("c");
        if (fromUrl && fromUrl !== selectedUuid) setSelectedUuid(fromUrl);
    }, [searchParams, selectedUuid]);

    /**
     * Live updates. The same stream the background notifier uses, shared so the
     * browser holds exactly one connection.
     */
    useEffect(() => {
        const unsubscribe = subscribeAdminStream((event) => {
            const data = event.data;
            if (event.type === "message" && data) {
                if (data.conversationUuid === selectedRef.current) {
                    setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
                    // Scrolled up reading history: count what arrived instead of
                    // yanking the view down, which is what WhatsApp Web does.
                    if (!stickToBottomRef.current && data.direction === "CLIENT") {
                        setPendingJump((count) => count + 1);
                    }
                }
                setConversations((prev) => {
                    const index = prev.findIndex((c) => c.uuid === data.conversationUuid);
                    if (index === -1) return prev;
                    const updated = {
                        ...prev[index],
                        lastMessagePreview: data.content,
                        lastMessageAt: data.createdAt,
                        unreadCount:
                            data.direction === "CLIENT" && data.conversationUuid !== selectedRef.current
                                ? (prev[index].unreadCount || 0) + 1
                                : prev[index].unreadCount,
                        awaitingAdmin: data.direction === "CLIENT",
                    };
                    // Newest activity first, exactly like a chat list.
                    return [updated, ...prev.filter((c) => c.uuid !== data.conversationUuid)];
                });
                if (data.direction === "CLIENT") {
                    setTypingPeers((prev) => ({ ...prev, [data.conversationUuid]: false }));
                }
                return;
            }
            if (event.type === "status" && data) {
                setMessages((prev) => prev.map((m) => (m.id === data.id ? { ...m, ...data } : m)));
                return;
            }
            if (event.type === "conversation" && data) {
                // Refresh in place: a conversation event for an older thread must
                // not drag it to the top of the list, the message handler does that.
                setConversations((prev) => {
                    const index = prev.findIndex((c) => c.uuid === data.uuid);
                    if (index === -1) return [data, ...prev];
                    const next = [...prev];
                    next[index] = { ...next[index], ...data };
                    return next;
                });
                return;
            }
            if (event.type === "typing" && data) {
                setTypingPeers((prev) => ({ ...prev, [data.conversationUuid]: Boolean(data.typing) }));
                return;
            }
            if (event.type === "presence" && data) {
                setPresence((prev) => ({ ...prev, [data.conversationUuid]: Boolean(data.online) }));
            }
        });
        return unsubscribe;
    }, []);

    // Safety net while the stream is reconnecting.
    useEffect(() => {
        const timer = window.setInterval(() => {
            if (!isStreamConnected()) {
                loadConversations();
                if (selectedRef.current) loadHistory(selectedRef.current);
            }
        }, FALLBACK_POLL_MS);
        return () => window.clearInterval(timer);
    }, [loadConversations, loadHistory]);

    const scrollToBottom = useCallback((smooth = true) => {
        const node = threadRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior: smooth ? "smooth" : "auto" });
        setPendingJump(0);
        stickToBottomRef.current = true;
    }, []);

    useEffect(() => {
        if (stickToBottomRef.current) {
            scrollToBottom(false);
        }
    }, [messages, scrollToBottom]);

    const handleThreadScroll = useCallback(() => {
        const node = threadRef.current;
        if (!node) return;
        const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
        stickToBottomRef.current = atBottom;
        if (atBottom) setPendingJump(0);
    }, []);

    const handleSelect = useCallback(
        (uuid) => {
            setSelectedUuid(uuid);
            stickToBottomRef.current = true;
            setPendingJump(0);
            // Keep the URL in step in both directions: leaving the thread on a
            // phone must also drop ?c=, or the deep-link effect reopens it.
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                if (uuid) {
                    next.set("c", uuid);
                } else {
                    next.delete("c");
                }
                return next;
            }, { replace: true });
        },
        [setSearchParams],
    );

    const handleSend = useCallback(async () => {
        const content = input.trim();
        if (!content || !selectedUuid) return;
        setInput("");
        try {
            const { data } = await sendAdminReply({ conversationUuid: selectedUuid, content });
            setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
            setConversations((prev) =>
                prev.map((c) =>
                    c.uuid === selectedUuid
                        ? { ...c, lastMessagePreview: content, lastMessageAt: data.createdAt, awaitingAdmin: false }
                        : c,
                ),
            );
            stickToBottomRef.current = true;
        } catch (error) {
            setLoadError(error?.response?.data?.message || t("adminChat.errors.replyFailed"));
        }
    }, [input, selectedUuid, t]);

    const handleInputChange = useCallback(
        (event) => {
            const value = event.target.value;
            setInput(value);
            if (!selectedUuid) return;
            const typing = value.length > 0;
            sendAdminTyping({ conversationUuid: selectedUuid, typing }).catch(() => { });
            window.clearTimeout(typingTimerRef.current);
            // Clear the indicator if the draft is abandoned: twice the beacon
            // interval, so a normal pause between keys never stops the typing.
            typingTimerRef.current = window.setTimeout(() => {
                sendAdminTyping({ conversationUuid: selectedUuid, typing: false }).catch(() => { });
            }, TYPING_BEACON_MS * 2);
        },
        [selectedUuid],
    );

    const handleCloseThread = useCallback(
        async (uuid) => {
            try {
                await closeAdminConversation(uuid);
                loadConversations();
            } catch (error) {
                setLoadError(error?.response?.data?.message || t("adminChat.errors.loadFailed"));
            }
        },
        [loadConversations, t],
    );

    const handleBeginConsent = useCallback(async () => {
        try {
            const { data } = await beginZaloConsent();
            setConsentUrl(data.authorizeUrl || "");
            if (data.authorizeUrl) window.open(data.authorizeUrl, "_blank", "noopener,noreferrer");
        } catch (error) {
            setLoadError(error?.response?.data?.message || t("adminChat.errors.consentFailed"));
        }
    }, [t]);

    const handlePushToggle = useCallback(async () => {
        setPushBusy(true);
        try {
            if (pushOn) {
                await disablePush();
                setPushOn(false);
                setNotice("");
            } else {
                const result = await enablePush();
                setPushOn(Boolean(result.ok));
                if (!result.ok) {
                    setNotice(
                        result.reason === "notConfigured"
                            ? t("adminChat.notifyNotConfigured")
                            : result.reason === "denied"
                                ? t("adminChat.notifyDenied")
                                : t("adminChat.notifyUnsupported"),
                    );
                } else {
                    setNotice("");
                }
            }
        } finally {
            setPushBusy(false);
        }
    }, [pushOn, t]);

    const visibleConversations = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return conversations;
        return conversations.filter(
            (c) =>
                String(c.clientTag || "").toLowerCase().includes(needle) ||
                String(c.ownerUsername || "").toLowerCase().includes(needle) ||
                String(c.ownerDisplayName || "").toLowerCase().includes(needle) ||
                String(c.lastMessagePreview || "").toLowerCase().includes(needle),
        );
    }, [conversations, search]);

    const selected = useMemo(
        () => conversations.find((item) => item.uuid === selectedUuid) || null,
        [conversations, selectedUuid],
    );

    const totalUnread = useMemo(
        () => conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
        [conversations],
    );

    // Messages with the day separators WhatsApp Web puts between blocks.
    const thread = useMemo(() => {
        const rows = [];
        let previousDay = "";
        messages.forEach((message, index) => {
            const day = dayKeyOf(message.createdAt);
            if (day && day !== previousDay) {
                rows.push({ kind: "day", key: `day-${day}`, label: dayLabelOf(message.createdAt, t) });
                previousDay = day;
            }
            rows.push({ kind: "message", key: message.id || `m-${index}`, message });
        });
        return rows;
    }, [messages, t]);

    const showThreadOnMobile = Boolean(selectedUuid);

    return (
        <Box sx={{ px: { xs: 1, md: 2 }, py: 1, height: PANE_HEIGHT, minHeight: 480, display: "flex", flexDirection: "column" }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ pb: 1, flexWrap: "wrap", rowGap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {t("adminChat.title")}
                </Typography>
                <Chip
                    size="small"
                    label={zalo?.ready ? t("adminChat.zaloReady") : t("adminChat.zaloLocal")}
                    color={zalo?.ready ? "success" : "default"}
                    onClick={() => { }}
                    clickable={false}
                />
                {totalUnread > 0 ? (
                    <Chip
                        size="small"
                        color="primary"
                        label={t("adminChat.unreadCount", { count: totalUnread })}
                        onClick={() => { }}
                        clickable={false}
                    />
                ) : null}
                <Box sx={{ flexGrow: 1 }} />
                <Tooltip title={pushOn ? t("adminChat.notifyDisable") : t("adminChat.notifyEnable")}>
                    <IconButton size="small" onClick={handlePushToggle} disabled={pushBusy}>
                        {pushOn ? <BellSvgIcon fontSize="small" /> : <BellOffSvgIcon fontSize="small" />}
                    </IconButton>
                </Tooltip>
                <Button size="small" variant="outlined" onClick={handleBeginConsent}>
                    {t("adminChat.connectZalo")}
                </Button>
            </Stack>

            {loadError ? <Alert severity="error" sx={{ mb: 1 }}>{loadError}</Alert> : null}
            {notice ? <Alert severity="warning" sx={{ mb: 1 }}>{notice}</Alert> : null}
            {consentUrl ? (
                <Alert severity="info" sx={{ mb: 1 }}>{t("adminChat.consentOpened")}</Alert>
            ) : null}

            <Box sx={{ flex: 1, minHeight: 0, display: "flex", gap: 1 }}>
                {/* ------------------------------------------------------ inbox */}
                <Paper
                    variant="outlined"
                    sx={{
                        width: { xs: showThreadOnMobile ? 0 : "100%", md: 340 },
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        border: "1px solid",
                        borderColor: "divider",
                    }}
                >
                    <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "divider" }}>
                        <TextField
                            size="small"
                            fullWidth
                            placeholder={t("adminChat.searchPlaceholder")}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchSvgIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Box>
                    <List disablePadding sx={{ flex: 1, overflowY: "auto" }}>
                        {visibleConversations.map((conversation) => {
                            const unread = conversation.unreadCount || 0;
                            const isTyping = Boolean(typingPeers[conversation.uuid]);
                            const isOnline = Boolean(presence[conversation.uuid]);
                            return (
                                <ListItemButton
                                    key={conversation.uuid}
                                    selected={conversation.uuid === selectedUuid}
                                    onClick={() => handleSelect(conversation.uuid)}
                                    sx={{ alignItems: "flex-start", gap: 1.5, py: 1.25, px: 1.5 }}
                                >
                                    <Box sx={{ position: "relative", flexShrink: 0 }}>
                                        <Avatar
                                            sx={{
                                                width: 42,
                                                height: 42,
                                                bgcolor: colorFromString(threadTitleOf(conversation, t)),
                                                fontSize: 15,
                                            }}
                                        >
                                            {initialsOf(threadTitleOf(conversation, t))}
                                        </Avatar>
                                        {isOnline ? (
                                            <Box
                                                sx={{
                                                    position: "absolute",
                                                    bottom: 0,
                                                    right: 0,
                                                    width: 11,
                                                    height: 11,
                                                    borderRadius: "50%",
                                                    bgcolor: "success.main",
                                                    border: "2px solid",
                                                    borderColor: "background.paper",
                                                }}
                                            />
                                        ) : null}
                                    </Box>
                                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                                {threadTitleOf(conversation, t)}
                                            </Typography>
                                            <Box sx={{ flexGrow: 1 }} />
                                            <Typography variant="caption" color="text.secondary" noWrap>
                                                {listTimeOf(conversation.lastMessageAt, t)}
                                            </Typography>
                                        </Stack>
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <Typography
                                                variant="body2"
                                                color={isTyping ? "primary.main" : "text.secondary"}
                                                noWrap
                                                sx={{ flexGrow: 1 }}
                                            >
                                                {isTyping
                                                    ? t("adminChat.typing")
                                                    : `${conversation.lastMessagePreview ? `${conversation.awaitingAdmin ? "" : t("adminChat.you")}${conversation.lastMessagePreview}` : t("adminChat.noMessages")}`}
                                            </Typography>
                                            {unread > 0 ? (
                                                <Chip
                                                    size="small"
                                                    color="primary"
                                                    label={unread}
                                                    onClick={() => { }}
                                                    clickable={false}
                                                    sx={{ height: 18, minWidth: 18, "& .MuiChip-label": { px: 0.6, fontSize: 11 } }}
                                                />
                                            ) : null}
                                        </Stack>
                                    </Box>
                                </ListItemButton>
                            );
                        })}
                        {visibleConversations.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                {conversations.length === 0 ? t("adminChat.empty") : t("common.noRecords")}
                            </Typography>
                        ) : null}
                    </List>
                </Paper>

                {/* ---------------------------------------------------- thread */}
                <Paper
                    variant="outlined"
                    sx={{
                        flexGrow: 1,
                        minWidth: 0,
                        display: { xs: showThreadOnMobile ? "flex" : "none", md: "flex" },
                        flexDirection: "column",
                        overflow: "hidden",
                    }}
                >
                    {!selected ? (
                        <Stack sx={{ height: "100%" }} alignItems="center" justifyContent="center" spacing={1}>
                            <Typography variant="body1" color="text.secondary">
                                {t("adminChat.selectConversation")}
                            </Typography>
                        </Stack>
                    ) : (
                        <>
                            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 1.5, py: 1 }}>
                                <IconButton
                                    size="small"
                                    sx={{ display: { md: "none" } }}
                                    onClick={() => handleSelect("")}
                                >
                                    <BackSvgIcon fontSize="small" />
                                </IconButton>
                                <Avatar
                                    sx={{
                                        width: 36,
                                        height: 36,
                                        bgcolor: colorFromString(threadTitleOf(selected, t)),
                                        fontSize: 14,
                                    }}
                                >
                                    {initialsOf(threadTitleOf(selected, t))}
                                </Avatar>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="subtitle2" noWrap>
                                        {threadTitleOf(selected, t)}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap>
                                        {typingPeers[selected.uuid]
                                            ? t("adminChat.typing")
                                            : presence[selected.uuid]
                                                ? t("adminChat.online")
                                                : t("adminChat.offline")}
                                        {selected.ownerUsername
                                            ? ` · @${selected.ownerUsername}`
                                            : ` · #${selected.clientTag || "????"}`}
                                    </Typography>
                                </Box>
                                <Box sx={{ flexGrow: 1 }} />
                                <Tooltip title={t("adminChat.closeThread")}>
                                    <IconButton size="small" onClick={() => handleCloseThread(selected.uuid)}>
                                        <CloseSvgIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                            <Divider />

                            <Box
                                ref={threadRef}
                                onScroll={handleThreadScroll}
                                sx={{
                                    flex: 1,
                                    minHeight: 0,
                                    overflowY: "auto",
                                    px: { xs: 1.5, md: 4 },
                                    py: 2,
                                    bgcolor: "rgba(0,0,0,0.02)",
                                }}
                            >
                                {thread.map((row) => {
                                    if (row.kind === "day") {
                                        return (
                                            <Stack key={row.key} alignItems="center" sx={{ my: 1.5 }}>
                                                <Chip
                                                    size="small"
                                                    label={row.label}
                                                    onClick={() => { }}
                                                    clickable={false}
                                                    sx={{ bgcolor: "background.paper", fontSize: 11 }}
                                                />
                                            </Stack>
                                        );
                                    }
                                    const message = row.message;
                                    const fromClient = message.direction === "CLIENT";
                                    return (
                                        <Stack
                                            key={row.key}
                                            direction="row"
                                            justifyContent={fromClient ? "flex-start" : "flex-end"}
                                            sx={{ mb: 0.75 }}
                                        >
                                            <Box
                                                sx={{
                                                    maxWidth: { xs: "82%", md: "65%" },
                                                    px: 1.25,
                                                    py: 0.75,
                                                    borderRadius: 2,
                                                    borderTopLeftRadius: fromClient ? 0 : 8,
                                                    borderTopRightRadius: fromClient ? 8 : 0,
                                                    bgcolor: fromClient ? "background.paper" : "#d9fdd3",
                                                    color: "text.primary",
                                                    boxShadow: "0 1px 1px rgba(0,0,0,0.08)",
                                                }}
                                            >
                                                <Typography
                                                    variant="body2"
                                                    sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                                                >
                                                    {message.content}
                                                </Typography>
                                                <Stack
                                                    direction="row"
                                                    spacing={0.5}
                                                    alignItems="center"
                                                    justifyContent="flex-end"
                                                    sx={{ mt: 0.25 }}
                                                >
                                                    <Typography variant="caption" color="text.disabled">
                                                        {clockOf(message.createdAt)}
                                                    </Typography>
                                                    {!fromClient ? <DeliveryTicks status={message.status} /> : null}
                                                </Stack>
                                            </Box>
                                        </Stack>
                                    );
                                })}
                            </Box>

                            {pendingJump > 0 ? (
                                <Stack alignItems="center" sx={{ py: 0.5 }}>
                                    <Chip
                                        size="small"
                                        label={t("adminChat.jumpToLatest", { count: pendingJump })}
                                        onClick={() => scrollToBottom()}
                                        clickable
                                    />
                                </Stack>
                            ) : null}

                            <Divider />
                            <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ p: 1.25 }}>
                                <TextField
                                    size="small"
                                    fullWidth
                                    multiline
                                    maxRows={4}
                                    placeholder={t("adminChat.placeholder")}
                                    value={input}
                                    onChange={handleInputChange}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                />
                                <IconButton color="primary" onClick={handleSend} disabled={!input.trim()}>
                                    <SendSvgIcon />
                                </IconButton>
                            </Stack>
                        </>
                    )}
                </Paper>
            </Box>
        </Box>
    );
};

export default AdminChatPage;
