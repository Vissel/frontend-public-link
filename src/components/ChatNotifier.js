import React, { useCallback, useEffect, useRef, useState } from "react";
import { Snackbar, Stack, Typography, Button } from "@mui/material";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchAdminConversations } from "../api/chatApi";
import { useAuth } from "../AuthContext";
import { closeAdminStream, subscribeAdminStream } from "../util/chatStream";
import { getPushState, registerChatServiceWorker } from "../util/push";
import { playChime } from "../util/sound";
import { setUnreadTotal } from "../util/chatUnread";

const CHAT_ROUTE = "/adminChat";

/**
 * Background chat watcher for the administrator.
 *
 * It owns the single live event stream, keeps the account-menu badge in step
 * with the server's unread counters, and decides what a new guest message sounds
 * like depending on where the administrator is looking:
 *
 * - on the chat page, visible: nothing, the thread already shows it;
 * - elsewhere in the app, visible: chime plus a toast;
 * - tab hidden with push on: nothing here, the service worker raises the system
 *   notification (and its sound), so there is never a double alert;
 * - tab hidden without push: chime plus a Notification if permission was given.
 */
const ChatNotifier = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, userRole } = useAuth();

  const isAdmin = String(userRole || "").toLowerCase() === "admin";
  const active = isAuthenticated && isAdmin;

  const unreadRef = useRef({});
  // Route read through a ref: a listener that changes on every navigation would
  // tear the shared stream down and reconnect it on each page switch.
  const pathRef = useRef(location.pathname);
  useEffect(() => {
    pathRef.current = location.pathname;
  }, [location.pathname]);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(0);

  const publishTotal = useCallback(() => {
    const total = Object.values(unreadRef.current).reduce((sum, value) => sum + (value || 0), 0);
    setUnreadTotal(total);
  }, []);

  const applyConversation = useCallback(
    (conversation) => {
      if (!conversation || !conversation.uuid) {
        return;
      }
      unreadRef.current[conversation.uuid] = conversation.unreadCount || 0;
      publishTotal();
    },
    [publishTotal],
  );

  const seedUnread = useCallback(async () => {
    try {
      const { data } = await fetchAdminConversations({ page: 0, size: 100 });
      unreadRef.current = {};
      (data.conversations || []).forEach((conversation) => {
        unreadRef.current[conversation.uuid] = conversation.unreadCount || 0;
      });
      publishTotal();
    } catch {
      // A failed seed only means the badge starts from what it already had.
    }
  }, [publishTotal]);

  const handleGuestMessage = useCallback(
    async (message) => {
      const onChatPage = String(pathRef.current || "").startsWith(CHAT_ROUTE);
      const visible = !document.hidden;
      if (onChatPage && visible) {
        return;
      }

      const title = t("chatNotify.title");
      const body = `${t("chatNotify.guestBody", { tag: message.clientTag || "????" })}: ${message.content || ""}`;
      const target = `${CHAT_ROUTE}?c=${message.conversationUuid || ""}`;

      if (visible) {
        playChime();
        window.clearTimeout(toastTimerRef.current);
        setToast({ title, body, target });
        toastTimerRef.current = window.setTimeout(() => setToast(null), 7000);
        return;
      }

      // Hidden: leave it to the system notification when push is on, otherwise
      // make the noise here so a message is never completely silent.
      const state = await getPushState();
      if (state === "subscribed") {
        return;
      }
      playChime();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(title, { body, tag: `chat-${message.conversationUuid}`, renotify: true, silent: true });
      }
    },
    [t],
  );

  useEffect(() => {
    if (!active) {
      closeAdminStream();
      setUnreadTotal(0);
      unreadRef.current = {};
      return undefined;
    }

    registerChatServiceWorker();
    seedUnread();

    const unsubscribe = subscribeAdminStream((event) => {
      if (event.type === "connect") {
        seedUnread();
        return;
      }
      if (event.type === "conversation") {
        applyConversation(event.data);
        return;
      }
      if (event.type === "message" && event.data) {
        if (event.data.direction === "CLIENT") {
          handleGuestMessage(event.data);
        }
      }
    });

    return () => {
      unsubscribe();
      window.clearTimeout(toastTimerRef.current);
    };
  }, [active, applyConversation, handleGuestMessage, seedUnread]);

  // A click on a system notification lands here when the window already exists.
  useEffect(() => {
    if (!active || !("serviceWorker" in navigator)) {
      return undefined;
    }
    const onMessage = (event) => {
      const data = event.data;
      if (data && data.type === "chat-open" && data.url) {
        navigate(`/${String(data.url).replace(/^\//, "")}`);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [active, navigate]);

  if (!toast) {
    return null;
  }

  return (
    <Snackbar
      open
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      message={
        <Stack spacing={0.25}>
          <Typography variant="subtitle2">{toast.title}</Typography>
          <Typography variant="body2" sx={{ opacity: 0.85 }}>
            {toast.body}
          </Typography>
        </Stack>
      }
      action={
        <Button color="inherit" size="small" onClick={() => { setToast(null); navigate(toast.target); }}>
          {t("chatNotify.open")}
        </Button>
      }
    />
  );
};

export default ChatNotifier;
