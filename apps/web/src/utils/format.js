export const formatKsh = (n) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;

export const formatCompact = (n) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

export const pluralise = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
