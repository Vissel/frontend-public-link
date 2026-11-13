import { fetchVapidPublicKey, registerPushSubscription, removePushSubscription } from "../api/chatApi";

/**
 * Browser push wiring for the admin console.
 *
 * Everything here degrades quietly: an unsupported browser, a denied permission
 * or a server without VAPID keys simply means no background notification, while
 * the in-page sound and the console itself keep working.
 */

const SW_PATH = `${process.env.PUBLIC_URL || ""}/chat-sw.js`;

/** VAPID keys are base64url; PushManager wants the raw bytes. */
const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
};

export const isPushSupported = () =>
  typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator && "Notification" in window;

const getRegistration = async () => {
  if (!isPushSupported()) {
    return null;
  }
  try {
    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = await navigator.serviceWorker.register(SW_PATH);
    }
    return registration;
  } catch {
    return null;
  }
};

export const registerChatServiceWorker = getRegistration;

/** "subscribed" | "denied" | "unsupported" | "idle" */
export const getPushState = async () => {
  if (!isPushSupported()) {
    return "unsupported";
  }
  const registration = await getRegistration();
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  if (subscription) {
    return "subscribed";
  }
  return Notification.permission === "denied" ? "denied" : "idle";
};

/**
 * Asks for permission, subscribes the browser and hands the subscription to
 * chat-app. Returns a reason string when it could not switch push on, which the
 * console shows instead of a dead toggle.
 */
export const enablePush = async () => {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  let key = null;
  try {
    const { data } = await fetchVapidPublicKey();
    if (!data?.configured || !data.publicKey) {
      return { ok: false, reason: "notConfigured" };
    }
    key = data.publicKey;
  } catch {
    return { ok: false, reason: "notConfigured" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "denied" };
  }

  const registration = await getRegistration();
  if (!registration) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    await registerPushSubscription(subscription.toJSON());
    return { ok: true };
  } catch (error) {
    console.warn("Chat push subscription failed", error);
    return { ok: false, reason: "unsupported" };
  }
};

export const disablePush = async () => {
  const registration = await getRegistration();
  if (!registration) {
    return;
  }
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }
  const json = subscription.toJSON();
  // Tell the server first: a stale endpoint only ever answers 410 and makes
  // every later fan-out do useless work.
  await removePushSubscription(json.endpoint).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
};
