import { chatApi } from "./index";

/**
 * Chat bridge API.
 *
 * Every call goes to the chat-app service through the gateway's /chat namespace
 * (see CHAT_CONTEXT_PATH in api/index.js), not to publiclink-app.
 *
 * Client calls are public (visitors are recognised by device identity, not by an
 * account). Administrator calls live under /admin/v1/chat and therefore carry the
 * JWT that the axios interceptor attaches.
 */

// ── client side ──────────────────────────────────────────────────────────────

export const startChat = (payload) => chatApi.post("/api/v1/chat/start", payload);

export const sendChatMessage = (payload) => chatApi.post("/api/v1/chat/message", payload);

export const fetchChatHistory = (payload) => chatApi.post("/api/v1/chat/history", payload);

export const sendChatTyping = (payload) => chatApi.post("/api/v1/chat/typing", payload);

export const closeChatConversation = (conversationUuid) =>
  chatApi.post("/api/v1/chat/close", null, { params: { conversationUuid } });

/**
 * Live status feed for one conversation. EventSource is used rather than axios
 * because it reconnects on its own and resends Last-Event-ID, which is exactly
 * what lets the server replay whatever arrived while the tab was closed.
 *
 * The per-conversation key issued by /start is the credential: a device id is
 * shared by every account on one browser, so it must never key the live feed.
 */
export const clientStreamUrl = ({ conversationUuid, key }) => {
  const base = chatApi.defaults?.baseURL || "";
  const params = new URLSearchParams();
  if (conversationUuid) params.set("conversationUuid", conversationUuid);
  if (key) params.set("key", key);
  return `${base}/api/v1/chat/stream?${params.toString()}`;
};

// ── administrator console ────────────────────────────────────────────────────
// The console no longer polls for live data: it opens /admin/v1/chat/stream with
// a single-use ticket. EventSource cannot send an Authorization header, so the
// ticket (issued by a normal JWT call below) is the credential on that URL.

export const fetchAdminConversations = ({ page = 0, size = 50 } = {}) =>
  chatApi.get("/admin/v1/chat/conversations", { params: { page, size } });

export const fetchAdminHistory = (conversationUuid) =>
  chatApi.get("/admin/v1/chat/history", { params: { conversationUuid } });

export const sendAdminReply = (payload) => chatApi.post("/admin/v1/chat/reply", payload);

export const sendAdminTyping = (payload) => chatApi.post("/admin/v1/chat/typing", payload);

export const closeAdminConversation = (conversationUuid) =>
  chatApi.post("/admin/v1/chat/close", null, { params: { conversationUuid } });

// ── Zalo bridge diagnostics / setup ─────────────────────────────────────────

export const fetchZaloStatus = () => chatApi.get("/admin/v1/chat/zalo/status");

export const beginZaloConsent = () => chatApi.post("/admin/v1/chat/zalo/consent/begin");

// ── console event stream credential ──────────────────────────────────────────

export const fetchStreamTicket = () => chatApi.post("/admin/v1/chat/stream-ticket");

/** Ticket must be fresh per connection: the backend consumes it on first use. */
export const adminStreamUrl = (ticket) => {
  const base = chatApi.defaults?.baseURL || "";
  return `${base}/admin/v1/chat/stream?ticket=${encodeURIComponent(ticket)}`;
};

// ── background notifications ─────────────────────────────────────────────────

export const fetchVapidPublicKey = () => chatApi.get("/admin/v1/chat/push/vapid-public-key");

export const registerPushSubscription = (payload) =>
  chatApi.post("/admin/v1/chat/push/subscribe", payload);

export const removePushSubscription = (endpoint) =>
  chatApi.post("/admin/v1/chat/push/unsubscribe", { endpoint });
