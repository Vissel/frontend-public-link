/**
 * Client identity for the public chat widget.
 *
 * Identity is account-first: a signed-in tab chats as its account and the
 * server binds the thread to that account. The device id below only serves
 * signed-out visitors, and it is scoped per account so two accounts signed in
 * on one browser never share a device row, a visit counter or a fingerprint.
 *
 * What a browser can and cannot prove about a customer:
 * - MAC address: impossible. No web API exposes it, on any platform. Any design
 *   that claims a MAC check from a browser is wrong by construction.
 * - IP: readable only server-side (X-Real-IP set by nginx). It is hashed with a
 *   server salt and is NEVER used alone to recognise a visitor, because
 *   Vietnamese mobile users sit behind carrier-grade NAT and share addresses.
 * - Browser attributes: a salted per-attribute fingerprint, used only to
 *   re-link a signed-out visitor whose storage was wiped, and only in
 *   combination with the hashed IP when the match is partial.
 */

const STORAGE_KEY = "publiclink.chat.deviceId";
const ATTRIBUTES_KEY = "publiclink.chat.attributes";

// Signed-in accounts get their own device row; anonymous visitors keep the
// legacy key so returning customers are not orphaned by this release.
const scopedKey = (scope) => (scope ? `${STORAGE_KEY}.u.${scope}` : STORAGE_KEY);

const memoryFallback = new Map();

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

/**
 * Stable device id for one identity scope ("" = anonymous, username = account),
 * created on first call and persisted afterwards.
 */
export const getDeviceId = (scope = "") => {
  const key = scopedKey(scope);
  const storage = safeStorage();
  if (!storage) {
    if (!memoryFallback.has(key)) memoryFallback.set(key, randomId());
    return memoryFallback.get(key);
  }
  let stored = storage.getItem(key);
  if (!stored) {
    stored = randomId();
    storage.setItem(key, stored);
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

export const forgetDevice = (scope = "") => {
  const key = scopedKey(scope);
  const storage = safeStorage();
  if (storage) storage.removeItem(key);
  memoryFallback.delete(key);
};
