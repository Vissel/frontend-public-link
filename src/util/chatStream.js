import { adminStreamUrl, fetchStreamTicket } from "../api/chatApi";

/**
 * The one administrator event stream per browser.
 *
 * Both the chat console and the background notifier need the same live feed, and
 * the backend counts subscribers on a shared sink - opening two streams would
 * double the traffic and make "is an admin watching" wrong. So this module owns
 * a single EventSource and fans its events out to whoever is listening.
 *
 * Reconnects with capped backoff, fetching a new ticket every attempt because
 * the backend consumes a ticket on first use.
 */

const EVENT_TYPES = ["message", "status", "typing", "conversation", "presence", "ping"];
const MAX_BACKOFF_MS = 30000;

const listeners = new Set();

let source = null;
let connected = false;
let wantOpen = false;
let backoffMs = 1000;
let reconnectTimer = 0;

const emit = (event) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      // One failing listener must not silence the feed for the others.
      console.warn("chat stream listener failed", error);
    }
  });
};

const closeSocket = () => {
  if (source) {
    source.close();
    source = null;
  }
  connected = false;
};

const scheduleReconnect = () => {
  if (!wantOpen || reconnectTimer) {
    return;
  }
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    open();
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
};

async function open() {
  if (!wantOpen) {
    return;
  }
  let url = "";
  try {
    const { data } = await fetchStreamTicket();
    url = adminStreamUrl(data.ticket);
  } catch (error) {
    // No ticket means no JWT (or no network): retry quietly, the console still
    // works on its fallback poll.
    scheduleReconnect();
    return;
  }

  closeSocket();
  source = new EventSource(url);

  EVENT_TYPES.forEach((type) => {
    source.addEventListener(type, (event) => {
      let payload = null;
      try {
        payload = event.data && event.data !== "1" ? JSON.parse(event.data) : null;
      } catch {
        payload = null;
      }
      emit({ type, data: payload, lastEventId: event.lastEventId });
    });
  });

  source.onopen = () => {
    connected = true;
    backoffMs = 1000;
    emit({ type: "connect", data: null });
  };

  source.onerror = () => {
    closeSocket();
    emit({ type: "disconnect", data: null });
    scheduleReconnect();
  };
}

/** Adds a listener and opens the stream for the first one. */
export const subscribeAdminStream = (listener) => {
  listeners.add(listener);
  if (!wantOpen) {
    wantOpen = true;
    open();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      wantOpen = false;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = 0;
      closeSocket();
    }
  };
};

/** Lets the console decide whether it still needs its safety poll. */
export const isStreamConnected = () => connected;

/** Drops the stream on sign-out, so a new account never inherits it. */
export const closeAdminStream = () => {
  listeners.clear();
  wantOpen = false;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  closeSocket();
};
