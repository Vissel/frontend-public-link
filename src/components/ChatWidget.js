import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Badge,
    Box,
    CircularProgress,
    Divider,
    IconButton,
    Paper,
    Stack,
    SvgIcon,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import {
    clientStreamUrl,
    closeChatConversation,
    sendChatMessage,
    sendChatTyping,
    startChat,
} from "../api/chatApi";
import { collectAttributes, getDeviceId, rememberAttributes } from "../util/chatIdentity";

const TYPING_BEACON_MS = 3000;
const MAX_CONTENT_LENGTH = 2000;

const ChatSvgIcon = (props) => (
    <SvgIcon {...props} viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H5.17L4 15.17V4h16v10z" />
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

/**
 * Delivery ladder rendered next to a visitor's own message.
 * SENT / DELIVERED / SEEN come from Zalo, REPLIED from the administrator answer.
 */
const MessageStatus = ({ status, connected }) => {
    const { t } = useTranslation();

    if (status === "FAILED") {
        return (
            <Typography variant="caption" color="error.main">
                {t("chat.status.failed")}
            </Typography>
        );
    }
    if (status === "PENDING" || !status) {
        return connected ? (
            <CircularProgress size={10} />
        ) : (
            <Typography variant="caption" color="text.secondary">
                {t("chat.status.waiting")}
            </Typography>
        );
    }
    if (status === "SENT") {
        return (
            <Tooltip title={t("chat.status.sentHint")}>
                <CheckSvgIcon fontSize="inherit" htmlColor="inherit" />
            </Tooltip>
        );
    }
    if (status === "DELIVERED") {
        return (
            <Tooltip title={t("chat.status.deliveredHint")}>
                <CheckSvgIcon double fontSize="inherit" />
            </Tooltip>
        );
    }
    if (status === "SEEN" || status === "REPLIED") {
        return (
            <Tooltip
                title={status === "REPLIED" ? t("chat.status.repliedHint") : t("chat.status.seenHint")}
            >
                <CheckSvgIcon double fontSize="inherit" htmlColor="#1976d2" />
            </Tooltip>
        );
    }
    return null;
};

const ChatWidget = () => {
    const { t } = useTranslation();
    const { isAuthenticated, username } = useAuth();
    // The thread belongs to the signed-in account, not to the browser: two
    // accounts on one machine share local storage, so the widget must forget
    // everything whenever the account changes.
    const accountKey = isAuthenticated ? username || "" : "";

    const [open, setOpen] = useState(false);
    const [starting, setStarting] = useState(false);
    const [started, setStarted] = useState(false);
    const [conversation, setConversation] = useState(null);
    const [streamKey, setStreamKey] = useState("");
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [connected, setConnected] = useState(false);
    const [adminTyping, setAdminTyping] = useState(false);
    const [unread, setUnread] = useState(0);
    const [errorText, setErrorText] = useState("");

    const streamRef = useRef(null);
    const listRef = useRef(null);
    const lastTypingSentRef = useRef(0);
    const openRef = useRef(open);
    // Device identity is scoped to the tab's account: two accounts on one
    // browser must not share a device row, visit counter or fingerprint.
    const deviceIdRef = useRef(getDeviceId(accountKey));
    // Refs are the source of truth for "already starting/started": the account
    // switch resets them in the same commit that re-starts the thread, before
    // React state has caught up.
    const startedRef = useRef(false);
    const startingRef = useRef(false);

    useEffect(() => {
        openRef.current = open;
        if (open) setUnread(0);
    }, [open]);

    // Account switch (sign in, sign out, another user): drop the previous
    // thread entirely. Keeping it would show one account the other's history.
    useEffect(() => {
        startedRef.current = false;
        startingRef.current = false;
        deviceIdRef.current = getDeviceId(accountKey);
        setConversation(null);
        setStreamKey("");
        setMessages([]);
        setStarted(false);
        setAdminTyping(false);
        setUnread(0);
        setErrorText("");
    }, [accountKey]);

    const scrollToEnd = useCallback(() => {
        const node = listRef.current;
        if (node) node.scrollTop = node.scrollHeight;
    }, []);

    useEffect(() => {
        scrollToEnd();
    }, [messages, adminTyping, scrollToEnd]);

    /** Opens or resumes the conversation the first time the widget is expanded. */
    const ensureStarted = useCallback(async () => {
        if (startedRef.current || startingRef.current) return;
        startingRef.current = true;
        setStarting(true);
        setErrorText("");
        const attributes = collectAttributes();
        rememberAttributes(attributes);
        try {
            const { data } = await startChat({ deviceId: deviceIdRef.current, attributes });
            const owner = data.conversation?.ownerUsername || "";
            if (owner !== accountKey) {
                // The server bound this thread to a different identity than the
                // tab's session. Never render or write into somebody else's
                // conversation: reset and let the next open start clean.
                startedRef.current = false;
                setConversation(null);
                setStreamKey("");
                setMessages([]);
                setStarted(false);
                setErrorText(t("chat.errors.sessionChanged"));
                return;
            }
            setConversation(data.conversation);
            setStreamKey(data.streamKey || "");
            setMessages(data.messages || []);
            deviceIdRef.current = data.deviceId;
            startedRef.current = true;
            setStarted(true);
        } catch (error) {
            setErrorText(
                error?.response?.data?.message || error?.message || t("chat.errors.startFailed"),
            );
        } finally {
            startingRef.current = false;
            setStarting(false);
        }
    }, [t, accountKey]);

    // Account switched while the panel is already open: continue in the new
    // account's thread without waiting for another click.
    const accountRef = useRef(accountKey);
    useEffect(() => {
        if (accountRef.current === accountKey) return;
        accountRef.current = accountKey;
        if (openRef.current) ensureStarted();
    }, [accountKey, ensureStarted]);

    // ── event stream: live messages, status transitions, typing, heartbeat ────
    useEffect(() => {
        if (!started || !conversation?.uuid || !streamKey) return undefined;

        const source = new EventSource(
            clientStreamUrl({ conversationUuid: conversation.uuid, key: streamKey }),
        );
        streamRef.current = source;

        source.onopen = () => setConnected(true);
        source.onerror = () => setConnected(false); // EventSource reconnects itself

        source.addEventListener("hello", () => setConnected(true));

        source.addEventListener("message", (event) => {
            const incoming = JSON.parse(event.data);
            // Defense in depth: a frame for another conversation must never be
            // rendered here, even if a proxy or stale sink misroutes it.
            if (incoming.conversationUuid && incoming.conversationUuid !== conversation.uuid) return;
            setMessages((previous) => {
                // Replace the optimistic copy of a message this tab just sent.
                const index = previous.findIndex(
                    (item) =>
                        (incoming.clientMessageId && item.clientMessageId === incoming.clientMessageId) ||
                        item.id === incoming.id,
                );
                if (index >= 0) {
                    const copy = [...previous];
                    copy[index] = { ...copy[index], ...incoming };
                    return copy;
                }
                if (incoming.direction === "ADMIN" && !openRef.current) setUnread((n) => n + 1);
                return [...previous, incoming];
            });
        });

        source.addEventListener("status", (event) => {
            const patch = JSON.parse(event.data);
            if (patch.conversationUuid && patch.conversationUuid !== conversation.uuid) return;
            setMessages((previous) =>
                previous.map((item) => (item.id === patch.id ? { ...item, ...patch } : item)),
            );
        });

        source.addEventListener("typing", (event) => {
            const frame = JSON.parse(event.data);
            if (frame.source === "ADMIN") {
                setAdminTyping(frame.typing);
                // Defensive: a missed false frame must not leave the dots spinning.
                if (frame.typing) window.setTimeout(() => setAdminTyping(false), 8000);
            }
        });

        return () => {
            source.close();
            streamRef.current = null;
            setConnected(false);
        };
    }, [started, conversation?.uuid, streamKey]);

    // A hidden tab drops its stream on most mobile browsers; reopen when visible.
    useEffect(() => {
        const onVisibility = () => {
            if (document.visibilityState === "visible" && openRef.current) ensureStarted();
        };
        document.addEventListener("visibilitychange", onVisibility);
        return () => document.removeEventListener("visibilitychange", onVisibility);
    }, [ensureStarted]);

    const handleSend = useCallback(async () => {
        const content = input.trim();
        if (!content || !conversation) return;

        const clientMessageId = `${deviceIdRef.current}-${Date.now()}`;
        const optimistic = {
            id: `local-${clientMessageId}`,
            conversationUuid: conversation.uuid,
            direction: "CLIENT",
            content,
            status: "PENDING",
            clientMessageId,
        };
        setMessages((previous) => [...previous, optimistic]);
        setInput("");
        setErrorText("");

        try {
            await sendChatMessage({
                conversationUuid: conversation.uuid,
                deviceId: deviceIdRef.current,
                clientMessageId,
                content,
            });
        } catch (error) {
            setMessages((previous) =>
                previous.map((item) =>
                    item.clientMessageId === clientMessageId ? { ...item, status: "FAILED" } : item,
                ),
            );
            if (error?.response?.status === 403) {
                // The thread belongs to another participant (account switched in
                // another tab): forget it and start clean on the next open.
                startedRef.current = false;
                setConversation(null);
                setStreamKey("");
                setStarted(false);
                setErrorText(t("chat.errors.sessionChanged"));
            } else {
                setErrorText(error?.response?.data?.message || t("chat.errors.sendFailed"));
            }
        }
    }, [conversation, input, t]);

    const handleInputChange = useCallback(
        (event) => {
            setInput(event.target.value);
            const now = Date.now();
            if (conversation && now - lastTypingSentRef.current > TYPING_BEACON_MS) {
                lastTypingSentRef.current = now;
                sendChatTyping({
                    conversationUuid: conversation.uuid,
                    deviceId: deviceIdRef.current,
                    typing: event.target.value.length > 0,
                }).catch(() => {
                    /* typing is decorative; never fail the chat over it */
                });
            }
        },
        [conversation],
    );

    const handleKeyDown = useCallback(
        (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
            }
        },
        [handleSend],
    );

    const headerNote = useMemo(() => {
        if (!conversation) return "";
        if (conversation.recognition && conversation.recognition !== "NEW" && conversation.visitCount > 1) {
            return t("chat.returningVisitor", { count: conversation.visitCount });
        }
        return "";
    }, [conversation, t]);

    return (
        <Box sx={{ position: "fixed", right: { xs: 12, md: 24 }, bottom: { xs: 12, md: 24 }, zIndex: 1300 }}>
            {open ? (
                <Paper
                    elevation={8}
                    sx={{
                        width: { xs: "calc(100vw - 24px)", sm: 380 },
                        height: { xs: "60dvh", sm: 480 },
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                    }}
                >
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2, py: 1.5 }}>
                        <ChatSvgIcon fontSize="small" />
                        <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="subtitle2">{t("chat.title")}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {starting ? t("chat.connecting") : connected ? t("chat.online") : t("chat.offline")}
                                {accountKey ? ` · ${t("chat.signedInAs", { name: accountKey })}` : ""}
                                {headerNote ? ` · ${headerNote}` : ""}
                            </Typography>
                        </Box>
                        <Tooltip title={t("chat.endChat")}>
                            <IconButton
                                size="small"
                                disabled={!conversation}
                                onClick={async () => {
                                    try {
                                        await closeChatConversation(conversation.uuid);
                                    } catch {
                                        /* closing is best effort; the local view resets anyway */
                                    }
                                    setConversation(null);
                                    setStreamKey("");
                                    setMessages([]);
                                    startedRef.current = false;
                                    setStarted(false);
                                    setOpen(false);
                                }}
                            >
                                <SvgIcon fontSize="small" viewBox="0 0 24 24">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                </SvgIcon>
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={t("chat.close")}>
                            <IconButton size="small" onClick={() => setOpen(false)}>
                                <Typography variant="h6" sx={{ lineHeight: 1 }}>
                                    ×
                                </Typography>
                            </IconButton>
                        </Tooltip>
                    </Stack>
                    <Divider />

                    <Box ref={listRef} sx={{ flexGrow: 1, overflowY: "auto", px: 1.5, py: 1.5 }}>
                        {messages.length === 0 && !starting ? (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: "center" }}>
                                {t("chat.empty")}
                            </Typography>
                        ) : null}

                        {messages.map((message, index) => {
                            const own = message.direction === "CLIENT";
                            return (
                                <Stack
                                    key={message.id || index}
                                    direction="row"
                                    justifyContent={own ? "flex-end" : "flex-start"}
                                    sx={{ mb: 1 }}
                                >
                                    <Box
                                        sx={{
                                            maxWidth: "80%",
                                            px: 1.5,
                                            py: 1,
                                            borderRadius: 2,
                                            bgcolor: own ? "primary.main" : "action.hover",
                                            color: own ? "primary.contrastText" : "text.primary",
                                        }}
                                    >
                                        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                            {message.content}
                                        </Typography>
                                        {own ? (
                                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ justifyContent: "flex-end", mt: 0.5 }}>
                                                <Typography variant="caption" sx={{ opacity: 0.85 }}>
                                                    {t(`chat.status.${message.status?.toLowerCase() || "pending"}`)}
                                                </Typography>
                                                <MessageStatus status={message.status} connected={connected} />
                                            </Stack>
                                        ) : null}
                                    </Box>
                                </Stack>
                            );
                        })}

                        {adminTyping ? (
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ pl: 1 }}>
                                <CircularProgress size={10} />
                                <Typography variant="caption" color="text.secondary">
                                    {t("chat.adminTyping")}
                                </Typography>
                            </Stack>
                        ) : null}
                    </Box>

                    {errorText ? (
                        <Typography variant="caption" color="error.main" sx={{ px: 2 }}>
                            {errorText}
                        </Typography>
                    ) : null}

                    <Divider />
                    <Stack direction="row" spacing={1} sx={{ p: 1.5 }} alignItems="flex-end">
                        <TextField
                            size="small"
                            multiline
                            maxRows={4}
                            fullWidth
                            placeholder={t("chat.placeholder")}
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            inputProps={{ maxLength: MAX_CONTENT_LENGTH }}
                            disabled={!conversation}
                        />
                        <IconButton color="primary" onClick={handleSend} disabled={!input.trim() || !conversation}>
                            <SvgIcon viewBox="0 0 24 24">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                            </SvgIcon>
                        </IconButton>
                    </Stack>
                </Paper>
            ) : (
                <Tooltip title={t("chat.open")}>
                    <IconButton
                        color="primary"
                        onClick={() => {
                            setOpen(true);
                            ensureStarted();
                        }}
                        sx={{
                            width: 56,
                            height: 56,
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                            "&:hover": { bgcolor: "primary.dark" },
                        }}
                    >
                        <Badge badgeContent={unread} color="error">
                            <ChatSvgIcon />
                        </Badge>
                    </IconButton>
                </Tooltip>
            )}
        </Box>
    );
};

export default ChatWidget;
