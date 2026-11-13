import { useEffect, useState } from "react";
import { searchAvailability } from "@/services/availabilityService.js";

/** Loads live availability for a search; cancels stale requests. Pass a `nonce` to force re-fetch on retry. */
export function useAvailability(search, enabled = true, nonce = 0) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const key = JSON.stringify(search);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    searchAvailability(search)
      .then((data) => !cancelled && setState({ loading: false, data, error: null }))
      .catch((error) => !cancelled && setState({ loading: false, data: null, error }));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, nonce]);

  return state;
}
