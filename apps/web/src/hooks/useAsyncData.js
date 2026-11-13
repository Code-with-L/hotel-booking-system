/** Shared async-resource hook: loading / ready / error + retry, with stale-response protection. */
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useAsyncData(fetcher, deps, { keepPrevious? })
 *  - Stale responses can never overwrite newer requests (request-id guard).
 *  - Mounting with deps in StrictMode double-invokes the effect; the second run wins,
 *    the first is discarded silently.
 */
export function useAsyncData(fetcher, deps = []) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const idRef = useRef(0);

  const retry = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const id = ++idRef.current;
    let live = true;
    setState((s) => (s.status === "ready" ? s : { status: "loading", data: null, error: null }));
    fetcher()
      .then((data) => {
        if (!live || idRef.current !== id) return;
        setState({ status: "ready", data, error: null });
      })
      .catch((error) => {
        if (!live || idRef.current !== id) return;
        if (error?.code === "ABORTED") return; // cancelled request: keep previous state untouched
        setState({ status: "error", data: null, error });
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { ...state, retry, loading: state.status === "loading" };
}
