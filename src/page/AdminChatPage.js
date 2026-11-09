import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    IconButton,
    List,
    ListItemButton,
    ListItemText,
    Paper,
    Stack,
    SvgIcon,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import PageContainer from "../components/PageContainer";
import {
    beginZaloConsent,
    closeAdminConversation,
    fetchAdminConversations,
    fetchAdminHistory,
    fetchZaloStatus,
    sendAdminReply,
    sendAdminTyping,
} from "../api/chatApi";

const POLL_INTERVAL_MS = 4000;
const TYPING_BEACON_MS = 3000;

const truncate = (text, maxLen) => {
    if (!text) return "";
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
};

/**
 * Administrator chat console (the browser alternative to answering in the Zalo
 * app). It polls rather than streaming because EventSource cannot carry the JWT.
 *
 * Every reply typed here is also mirrored into the Zalo thread when the bridge is
 * enabled, so the two surfaces never diverge.
 */
const AdminChatPage = () => {
    const { t } = useTranslation();

    const [conversations, setConversations] = useState([]);
    const [selectedUuid, setSelectedUuid] = useState("");
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [zalo, setZalo] = useState(null);
    const [loadError, setLoadError] = useState("");
    const [consentUrl, setConsentUrl] = useState("");

    const listRef = useRef(null);
    const typingTimerRef = useRef(0);
    const selectedRef = useRef(selectedUuid);

    useEffect(() => {
        selectedRef.current = selectedUuid;
    }, [selectedUuid]);

    const loadConversations = useCallback(async () => {
        try {
            const { data } = await fetchAdminConversations({ page: 0, size: 50 });
            setConversations(data.conversations || []);
            setLoadError("");
        } catch (error) {
            setLoadError(error?.response?.data?.message || t("adminChat.errors.loadFailed"));
        }
    }, [t]);

    const loadHistory = useCallback(async (uuid) => {
        if (!uuid) return;
        try {
            const { data } = await fetchAdminHistory(uuid);
            // Guard against a slow response for a conversation that was switched away.
            if (selectedRef.current === uuid) setMessages(data.messages || []);
        } catch (error) {
            setLoadError(error?.response?.data?.message || t("adminChat.errors.loadFailed"));
        }
    }, [t]);

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
        const timer = window.setInterval(() => {
            loadConversations();
            loadHistory(selectedRef.current);
        }, POLL_INTERVAL_MS);
        return () => window.clearInterval(timer);
    }, [loadConversations, loadHistory, loadZaloStatus]);

    useEffect(() => {
        if (selectedUuid) loadHistory(selectedUuid);
    }, [selectedUuid, loadHistory]);

    useEffect(() => {
        const node = listRef.current;
        if (node) node.scrollTop = node.scrollHeight;
    }, [messages]);

    const handleSend = useCallback(async () => {
        const content = input.trim();
        if (!content || !selectedUuid) return;
        setInput("");
        try {
            await sendAdminReply({ conversationUuid: selectedUuid, content });
            loadHistory(selectedUuid);
            loadConversations();
        } catch (error) {
            setLoadError(error?.response?.data?.message || t("adminChat.errors.replyFailed"));
        }
    }, [input, selectedUuid, loadHistory, loadConversations, t]);

    const handleTyping = useCallback(
        (event) => {
            setInput(event.target.value);
            if (!selectedUuid) return;
            sendAdminTyping({ conversationUuid: selectedUuid, typing: event.target.value.length > 0 }).catch(
                () => {
                    /* decorative only */
                },
            );
            window.clearTimeout(typingTimerRef.current);
            // Stop the indicator if the administrator abandons the draft: twice the
            // beacon interval, so a normal pause between keys never clears it.
            typingTimerRef.current = window.setTimeout(() => {
                sendAdminTyping({ conversationUuid: selectedUuid, typing: false }).catch(() => { });
            }, TYPING_BEACON_MS * 2);
        },
        [selectedUuid],
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

    const selected = useMemo(
        () => conversations.find((item) => item.uuid === selectedUuid) || null,
        [conversations, selectedUuid],
    );

    const statusLabel = (status) => t(`adminChat.status.${status}`, { defaultValue: status || "—" });

    return (
        <PageContainer maxWidth="xl">
            <Stack spacing={2}>
                <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="h5">{t("adminChat.title")}</Typography>
                    <Chip
                        size="small"
                        label={zalo?.ready ? t("adminChat.zaloReady") : t("adminChat.zaloLocal")}
                        color={zalo?.ready ? "success" : "default"}
                        onClick={() => { }}
                        clickable={false}
                    />
                    {zalo?.adminBound ? (
                        <Typography variant="caption" color="text.secondary">
                            {t("adminChat.zaloAdmin")}: {zalo.adminUserId}
                        </Typography>
                    ) : (
                        <Typography variant="caption" color="warning.main">
                            {t("adminChat.adminNotBoundHint")}
                        </Typography>
                    )}
                    <Button size="small" variant="outlined" onClick={handleBeginConsent}>
                        {t("adminChat.connectZalo")}
                    </Button>
                    {consentUrl ? (
                        <Typography variant="caption" color="text.secondary">
                            {t("adminChat.consentOpened")}
                        </Typography>
                    ) : null}
                </Stack>

                {loadError ? <Alert severity="error">{loadError}</Alert> : null}

                <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ minHeight: "60dvh" }}>
                    <Paper sx={{ width: { md: 340 }, flexShrink: 0, overflow: "auto" }} variant="outlined">
                        <Typography variant="subtitle2" sx={{ px: 2, py: 1.5 }}>
                            {t("adminChat.conversations")}
                        </Typography>
                        <Divider />
                        <List dense disablePadding>
                            {conversations.map((conversation) => (
                                <ListItemButton
                                    key={conversation.uuid}
                                    selected={conversation.uuid === selectedUuid}
                                    onClick={() => setSelectedUuid(conversation.uuid)}
                                >
                                    <ListItemText
                                        primary={
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                                    {`#${conversation.clientTag || "????"}`}
                                                </Typography>
                                                {conversation.awaitingAdmin ? (
                                                    <Chip
                                                        size="small"
                                                        label={t("adminChat.awaiting")}
                                                        color="warning"
                                                        onClick={() => { }}
                                                        clickable={false}
                                                    />
                                                ) : null}
                                            </Stack>
                                        }
                                        secondary={
                                            <>
                                                <Box component="span" sx={{ display: "block" }}>
                                                    {truncate(conversation.lastMessagePreview, 60) ||
                                                        t("adminChat.noMessages")}
                                                </Box>
                                                <Box
                                                    component="span"
                                                    sx={{ display: "block", color: "text.secondary" }}
                                                >
                                                    {`${statusLabel(conversation.status)} · ${t(
                                                        "adminChat.visits",
                                                        { count: conversation.clientMessageCount || 0 },
                                                    )}`}
                                                </Box>
                                            </>
                                        }
                                    />
                                </ListItemButton>
                            ))}
                            {conversations.length === 0 ? (
                                <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                    {t("adminChat.empty")}
                                </Typography>
                            ) : null}
                        </List>
                    </Paper>

                    <Paper sx={{ flexGrow: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        {!selected ? (
                            <Typography variant="body2" color="text.secondary" sx={{ p: 3 }}>
                                {t("adminChat.selectConversation")}
                            </Typography>
                        ) : (
                            <>
                                <Stack
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{ px: 2, py: 1.5 }}
                                >
                                    <Typography variant="subtitle2">
                                        {`${t("adminChat.conversation")} #${selected.clientTag}`}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {selected.uuid}
                                    </Typography>
                                    <Box sx={{ flexGrow: 1 }} />
                                    <Tooltip title={t("adminChat.closeThread")}>
                                        <IconButton
                                            size="small"
                                            onClick={async () => {
                                                await closeAdminConversation(selected.uuid).catch(() => { });
                                                loadConversations();
                                            }}
                                        >
                                            <SvgIcon fontSize="small" viewBox="0 0 24 24">
                                                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                                            </SvgIcon>
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                                <Divider />

                                <Box ref={listRef} sx={{ flexGrow: 1, overflowY: "auto", p: 2 }}>
                                    {messages.map((message, index) => {
                                        const fromClient = message.direction === "CLIENT";
                                        return (
                                            <Stack
                                                key={message.id || index}
                                                direction="row"
                                                justifyContent={fromClient ? "flex-start" : "flex-end"}
                                                sx={{ mb: 1 }}
                                            >
                                                <Box
                                                    sx={{
                                                        maxWidth: "75%",
                                                        px: 1.5,
                                                        py: 1,
                                                        borderRadius: 2,
                                                        bgcolor: fromClient ? "action.hover" : "primary.main",
                                                        color: fromClient ? "text.primary" : "primary.contrastText",
                                                    }}
                                                >
                                                    <Typography
                                                        variant="body2"
                                                        sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                                                    >
                                                        {message.content}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                                        {fromClient
                                                            ? t(`chat.status.${(message.status || "pending").toLowerCase()}`)
                                                            : statusLabel(selected.status)}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                        );
                                    })}
                                </Box>

                                <Divider />
                                <Stack direction="row" spacing={1} sx={{ p: 1.5 }} alignItems="flex-end">
                                    <TextField
                                        size="small"
                                        fullWidth
                                        multiline
                                        maxRows={4}
                                        placeholder={t("adminChat.placeholder")}
                                        value={input}
                                        onChange={handleTyping}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" && !event.shiftKey) {
                                                event.preventDefault();
                                                handleSend();
                                            }
                                        }}
                                    />
                                    <Button variant="contained" onClick={handleSend} disabled={!input.trim()}>
                                        {t("adminChat.send")}
                                    </Button>
                                </Stack>
                            </>
                        )}
                    </Paper>
                </Stack>
            </Stack>
        </PageContainer>
    );
};

export default AdminChatPage;
