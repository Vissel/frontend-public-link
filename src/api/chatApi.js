import { pubApi } from "./index";

/**
 * Chat bridge API.
 *
 * Client calls are public (visitors are recognised by device identity, not by an
 * account). Administrator calls live under /admin/v1/chat and therefore carry the
 * JWT that the axios interceptor attaches.
 */

// ── client side ──────────────────────────────────────────────────────────────

export const startChat = (payload) => pubApi.post("/api/v1/chat/start", payload);

export const sendChatMessage = (payload) => pubApi.post("/api/v1/chat/message", payload);

export const fetchChatHistory = (payload) => pubApi.post("/api/v1/chat/history", payload);

export const sendChatTyping = (payload) => pubApi.post("/api/v1/chat/typing", payload);

export const closeChatConversation = (conversationUuid) =>
  pubApi.post("/api/v1/chat/close", null, { params: { conversationUuid } });

/**
 * Live status feed for a visitor. EventSource is used rather than axios because it
 * reconnects on its own and resends Last-Event-ID, which is exactly what lets the
 * server replay whatever arrived while the tab was closed.
 */
export const clientStreamUrl = ({ deviceId, conversationUuid }) => {
  const base = pubApi.defaults?.baseURL || "";
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
  pubApi.get("/admin/v1/chat/conversations", { params: { page, size } });

export const fetchAdminHistory = (conversationUuid) =>
  pubApi.get("/admin/v1/chat/history", { params: { conversationUuid } });

export const sendAdminReply = (payload) => pubApi.post("/admin/v1/chat/reply", payload);

export const sendAdminTyping = (payload) => pubApi.post("/admin/v1/chat/typing", payload);

export const closeAdminConversation = (conversationUuid) =>
  pubApi.post("/admin/v1/chat/close", null, { params: { conversationUuid } });

// ── Zalo bridge diagnostics / setup ─────────────────────────────────────────

export const fetchZaloStatus = () => pubApi.get("/admin/v1/chat/zalo/status");

export const beginZaloConsent = () => pubApi.post("/admin/v1/chat/zalo/consent/begin");
