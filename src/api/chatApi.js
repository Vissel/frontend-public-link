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
 * Live status feed for a visitor. EventSource is used rather than axios because it
 * reconnects on its own and resends Last-Event-ID, which is exactly what lets the
 * server replay whatever arrived while the tab was closed.
 */
export const clientStreamUrl = ({ deviceId, conversationUuid }) => {
  const base = chatApi.defaults?.baseURL || "";
  const params = new URLSearchParams();
  if (deviceId) params.set("deviceId", deviceId);
  if (conversationUuid) params.set("conversationUuid", conversationUuid);
  return `${base}/api/v1/chat/stream?${params.toString()}`;
};

// ── administrator console ────────────────────────────────────────────────────
// The console polls instead of opening an event stream: EventSource cannot send an
// Authorization header, and these routes are JWT-protected. The backend does expose
// /admin/v1/chat/stream for a future cookie- or signed-url-based upgrade.

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
