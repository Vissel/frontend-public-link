/**
 * Tiny store for the admin chat unread total.
 *
 * ChatNotifier owns the live stream and writes the number here; the account
 * menu reads it. A module store rather than a React context because the writer
 * lives outside the route tree and the readers are two unrelated components -
 * and because it survives a route change without remounting anything.
 *
 * Persisted per TAB (sessionStorage), matching the per-tab login session: two
 * accounts signed in on one browser must not share one unread badge.
 */

const STORAGE_KEY = "chat:unread-total";

const readInitial = () => {
  try {
    const stored = Number(window.sessionStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
};

let total = readInitial();
const listeners = new Set();

export const getUnreadTotal = () => total;

export const setUnreadTotal = (value) => {
  const next = Number(value) > 0 ? Math.floor(Number(value)) : 0;
  if (next === total) return;
  total = next;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* storage disabled: the in-memory total still drives this tab */
  }
  listeners.forEach((listener) => listener(total));
};

export const subscribeUnread = (listener) => {
  listeners.add(listener);
  listener(total);
  return () => listeners.delete(listener);
};
