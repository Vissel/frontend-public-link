import { useCallback, useEffect, useRef } from "react";

/**
 * Long enough to read a one-line confirmation, short enough that the dialog
 * never feels stuck after the work is already done.
 */
export const SUCCESS_CLOSE_DELAY_MS = 800;

/**
 * Dismiss a dialog a moment after its success state has rendered.
 *
 * A dialog that has already saved its data should not ask the user to click
 * Close as well; closing the instant the request resolves hides the
 * confirmation the user just earned. This keeps it on screen briefly, then
 * calls the latest `onClose`.
 *
 * Follows the re-render guidance in
 * .agents/skills/vercel-react-best-practices:
 * - the pending timer and the newest `onClose` live in refs (5.15, 8.3), so a
 *   timer scheduled before a re-render still calls the current handler;
 * - `schedule` replaces any pending timer and both it and `cancel` are stable,
 *   so effects and memoized callbacks never churn (5.7, 5.11);
 * - the timer is cleared on unmount, so no state update happens after the
 *   owner is gone.
 *
 * Use `cancel` when the dialog is dismissed by hand (backdrop, Esc, Cancel),
 * and on any path that reopens or replaces the dialog's content, otherwise the
 * pending timer would close the next thing the user opened.
 *
 * @param {Function} onClose invoked after the delay; may be omitted
 * @param {{ delay?: number }} [options] override the default delay in ms
 * @returns {{ schedule: Function, cancel: Function }}
 */
const useDelayedClose = (onClose, { delay = SUCCESS_CLOSE_DELAY_MS } = {}) => {
  const timerRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(() => {
    cancel();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      closeRef.current?.();
    }, delay);
  }, [cancel, delay]);

  useEffect(() => cancel, [cancel]);

  return { schedule, cancel };
};

export default useDelayedClose;
