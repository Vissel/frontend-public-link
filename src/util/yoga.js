// Shared yoga calendar date helpers. Dates are plain yyyy-MM-dd strings; all
// week math is Monday-first to match the reference grid (Mon..Sun).

export const ISO_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n) => String(n).padStart(2, "0");

export const toIsoDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseIsoDate = (iso) => {
  const [y, m, d] = (iso || "").split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (iso, days) => {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
};

/** Monday of the week containing the given date (or today when blank). */
export const mondayOf = (iso) => {
  const date = iso ? parseIsoDate(iso) : new Date();
  const dow = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - dow);
  return toIsoDate(date);
};

/** The seven dates of a week starting at weekStart (a Monday). */
export const weekDates = (weekStartIso) =>
  Array.from({ length: 7 }, (_, i) => addDays(weekStartIso, i));

/** ISO weekday (1 = Mon .. 7 = Sun) of a yyyy-MM-dd date. */
export const isoWeekday = (iso) => {
  const dow = parseIsoDate(iso).getDay();
  return dow === 0 ? 7 : dow;
};

export const todayIso = () => toIsoDate(new Date());

export const hourLabel = (hour) => `${pad(hour)}:00`;

export const shortDate = (iso) => {
  const d = parseIsoDate(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};
