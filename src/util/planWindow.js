/**
 * Plan-window helpers for the Generate Product Link flows.
 *
 * The backend formats plan dates as "yyyy-MM-dd HH:mm:ss" (DateUtils) and is
 * the authority on the deadline: it clamps the generated link itself. These
 * helpers only drive the UI hint and the early block, so a small timezone
 * skew between browser and server cannot let a link outlive the plan.
 */

const HOUR_MS = 60 * 60 * 1000;

/** Parse a backend plan date; returns null when absent/unparseable. */
export const parsePlanDate = (value) => {
    if (!value || typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    // "yyyy-MM-dd HH:mm:ss" is not ISO; normalise the separator so Date parses it
    // as local time instead of returning Invalid Date in some browsers.
    const parsed = new Date(trimmed.replace(" ", "T"));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** Whole hours left until the plan ends; 0 when already ended. */
export const hoursUntilPlanEnd = (endedDate, now = new Date()) => {
    const end = parsePlanDate(endedDate);
    if (!end) {
        return null;
    }
    return Math.max(0, Math.floor((end.getTime() - now.getTime()) / HOUR_MS));
};

/**
 * Duration to request: the plan length, never more than the time left in the
 * paid window. Falls back to the plan length when no end date is known.
 */
export const clampedDurationHours = (planDay, endedDate, now = new Date()) => {
    const planHours = Math.max(1, Number(planDay || 1) * 24);
    const left = hoursUntilPlanEnd(endedDate, now);
    if (left === null) {
        return planHours;
    }
    return Math.max(1, Math.min(planHours, left));
};

/** The instant the new link will actually stop working. */
export const effectiveLinkExpiry = (planDay, endedDate, now = new Date()) => {
    const hours = clampedDurationHours(planDay, endedDate, now);
    const requested = new Date(now.getTime() + hours * HOUR_MS);
    const end = parsePlanDate(endedDate);
    return end && requested > end ? end : requested;
};

export const formatDateTime = (date) => {
    if (!date || Number.isNaN(date.getTime?.())) {
        return "";
    }
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
        + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const pad = (n) => String(n).padStart(2, "0");

/**
 * Local-time "yyyy-MM-ddTHH:mm" value for an <input type="datetime-local">.
 * Built from the local getters on purpose: toISOString() would render the UTC
 * day and quietly shift the chosen window by the browser offset.
 */
export const toInputValue = (date) => {
    if (!date || Number.isNaN(date.getTime?.())) {
        return "";
    }
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
        + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Parse a datetime-local value back to a Date; null when empty/invalid. */
export const fromInputValue = (value) => {
    if (!value || typeof value !== "string") {
        return null;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Validate a chosen sale window. Returns an error key (plus the plan end for
 * the message) or null when the window is usable. The backend re-checks all of
 * it; this only keeps the UI from submitting an obviously wrong window.
 */
export const validateSaleWindow = (startValue, endValue, planEndedDate, now = new Date()) => {
    const start = fromInputValue(startValue);
    const end = fromInputValue(endValue);
    if (!start || !end) {
        return { key: "required" };
    }
    if (end.getTime() <= start.getTime()) {
        return { key: "endBeforeStart" };
    }
    const planEnd = parsePlanDate(planEndedDate);
    // Start first: a start past the plan end drags the end past it too, so
    // checking the end first would always blame the wrong field.
    if (planEnd && start.getTime() > planEnd.getTime()) {
        return { key: "startAfterPlan", planEnd: formatDateTime(planEnd) };
    }
    if (planEnd && end.getTime() > planEnd.getTime()) {
        return { key: "endAfterPlan", planEnd: formatDateTime(planEnd) };
    }
    if (end.getTime() <= now.getTime()) {
        return { key: "endInPast" };
    }
    return null;
};
