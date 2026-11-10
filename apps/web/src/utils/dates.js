/** Date helpers. All dates in the app are ISO "YYYY-MM-DD" strings in local time. */

export const parseISO = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const toISO = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const todayISO = () => toISO(new Date());

export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const nightsBetween = (a, b) => {
  if (!a || !b) return 0;
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
};

export const formatDate = (iso) =>
  iso ? parseISO(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const formatDateLong = (iso) =>
  iso
    ? parseISO(iso).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

export const formatShort = (iso) =>
  iso ? parseISO(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";

export const isValidISO = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso || "") && !Number.isNaN(parseISO(iso).getTime());
