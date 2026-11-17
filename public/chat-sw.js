/* Service worker scope: `self` is the global here, and CRA's lint config only
   restricts it in application code, which is served by a window. */
/* eslint-disable no-restricted-globals */
/**
 * Service worker for background chat notifications.
 *
 * chat-app sends a push for every guest message, always, and this file is the
 * only place that knows what the administrator is actually looking at. That
 * split is deliberate: the server cannot see window focus, and the page cannot
 * run when the browser is closed - so the decision belongs here.
 *
 * A window that is on screen already receives the identical event over its
 * server-sent stream and decides locally whether to beep or show a toast, so an
 * OS notification here would double it. Only when nothing is visible does this
 * turn into a system notification, which is also what reaches an administrator
 * whose browser is minimised, on another tab, or not open at all.
 */

const CHAT_PAGE = "/adminChat";
const NOTIFICATION_ICON = "/img/logo-3.png";

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  event.waitUntil(showIfNeeded(payload));
});

async function showIfNeeded(payload) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const someoneIsLooking = clients.some(
    (client) => client.focused || client.visibilityState === "visible",
  );
  if (someoneIsLooking) {
    return;
  }

  const uuid = payload.conversationUuid || "unknown";
  await self.registration.showNotification(payload.title || "Chat", {
    body: payload.body || "",
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    tag: `chat-${uuid}`,
    renotify: true,
    data: { url: `${CHAT_PAGE}?c=${encodeURIComponent(uuid)}` },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || CHAT_PAGE;
  event.waitUntil(revealThread(url));
});

/**
 * Prefer the window that is already showing the console: opening a second one
 * would start a second event stream and split the unread state. The page picks
 * the thread up from the message below.
 */
async function revealThread(url) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = clients.find((client) => client.url.includes(CHAT_PAGE)) || clients[0];
  if (existing) {
    await existing.focus();
    existing.postMessage({ type: "chat-open", url });
    return;
  }
  await self.clients.openWindow(url);
}
