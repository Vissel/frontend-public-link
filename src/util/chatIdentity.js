/**
 * Client identity for the public chat widget.
 *
 * A visitor is not logged in, so the widget owns a device id that survives
 * closing the tab. Browsers cannot read a MAC address at all, and an IP alone is
 * unreliable behind carrier-grade NAT, so the widget also reports a small set of
 * browser attributes. The server hashes them with its own salt and uses them only
 * to re-link a visitor whose local storage was wiped.
 */

const STORAGE_KEY = "publiclink.chat.deviceId";
const ATTRIBUTES_KEY = "publiclink.chat.attributes";

let memoryFallback = "";

const randomId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older/insecure contexts where crypto.randomUUID is absent.
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const safeStorage = () => {
  try {
    const probe = "__chat_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private mode or storage disabled: keep the id for the lifetime of the page.
    return null;
  }
};

/** Stable device id, created on first call and persisted afterwards. */
export const getDeviceId = () => {
  const storage = safeStorage();
  if (!storage) {
    if (!memoryFallback) memoryFallback = randomId();
    return memoryFallback;
  }
  let stored = storage.getItem(STORAGE_KEY);
  if (!stored) {
    stored = randomId();
    storage.setItem(STORAGE_KEY, stored);
  }
  return stored;
};

/**
 * Ordered attribute vector. Position matters: the server compares component by
 * component, so the order must never change without a coordinated backend release.
 * Null values are kept as empty slots to hold the shape stable.
 */
export const collectAttributes = () => {
  const nav = typeof navigator === "undefined" ? {} : navigator;
  const screenInfo =
    typeof window === "undefined" || !window.screen
      ? ""
      : `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth || 0}`;

  let timezone = "";
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    timezone = "";
  }

  return [
    nav.userAgent || "",
    nav.language || "",
    (nav.languages || []).join(","),
    screenInfo,
    timezone,
    String(nav.platform || ""),
    String(nav.hardwareConcurrency || 0),
    String(nav.maxTouchPoints || 0),
    String(typeof window === "undefined" ? 0 : window.devicePixelRatio || 1),
  ];
};

/**
 * Attribute set the visitor used last time, so a returning visitor keeps the same
 * component count even when one attribute is temporarily unavailable. Purely
 * advisory: the server re-hashes and compares what it is given.
 */
export const rememberAttributes = (attributes) => {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(ATTRIBUTES_KEY, JSON.stringify(attributes || []));
  } catch {
    /* ignore quota errors */
  }
};

export const forgetDevice = () => {
  const storage = safeStorage();
  if (storage) storage.removeItem(STORAGE_KEY);
  memoryFallback = "";
};
