/** Safe sessionStorage wrapper (client-side persistence: booking draft, last confirmation). */
export const session = {
  get(key, fallback = null) {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — ignore */
    }
  },
  remove(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
