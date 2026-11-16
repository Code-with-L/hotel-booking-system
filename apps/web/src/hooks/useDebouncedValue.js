import { useEffect, useState } from "react";

/** Trailing-debounce a value. Used to auto-check availability ~400ms after the form stops changing. */
export function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  const key = JSON.stringify(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delay]);

  return debounced;
}
