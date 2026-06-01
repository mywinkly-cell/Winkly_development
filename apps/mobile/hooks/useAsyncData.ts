// apps/mobile/hooks/useAsyncData.ts
// Standard data-fetching primitive so every screen has an explicit
// loading / error / empty state with a retry — never a spinner that hangs.

import { useCallback, useEffect, useRef, useState } from "react";
import { isOfflineError } from "@/lib/network/connectivity";

export type AsyncStatus = "loading" | "success" | "error";

export type AsyncData<T> = {
  data: T | null;
  status: AsyncStatus;
  error: Error | null;
  /** True when the failure was due to being offline (show a tailored message). */
  isOffline: boolean;
  /** Re-run the fetcher (e.g. from a "Try again" button). */
  reload: () => void;
  isLoading: boolean;
  isError: boolean;
};

/**
 * Run an async fetcher with managed loading/error state.
 * - Re-runs when `deps` change.
 * - Ignores results from stale runs (avoids setState-after-unmount + races).
 * - Classifies offline failures so the UI can show "you're offline" + retry.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = []
): AsyncData<T> {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [error, setError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Bump on every run so late-resolving stale promises are discarded.
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const run = useCallback(() => {
    const runId = ++runIdRef.current;
    setStatus("loading");
    setError(null);
    setIsOffline(false);

    fetcher()
      .then((result) => {
        if (!mountedRef.current || runId !== runIdRef.current) return;
        setData(result);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (!mountedRef.current || runId !== runIdRef.current) return;
        setIsOffline(isOfflineError(err));
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return {
    data,
    status,
    error,
    isOffline,
    reload: run,
    isLoading: status === "loading",
    isError: status === "error",
  };
}
