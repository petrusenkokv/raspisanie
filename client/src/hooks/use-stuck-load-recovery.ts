import { useEffect, useRef } from "react";

const RELOAD_STORAGE_KEY = "schedule-auto-reload-at";
const RELOAD_COOLDOWN_MS = 60_000;

type StuckLoadRecoveryOptions = {
  /** True while initial data is still loading. */
  isLoading: boolean;
  /** True when the last fetch failed. */
  isError: boolean;
  /** Refetch without full page reload. */
  onRetry: () => void;
  /** Milliseconds before treating the load as stuck. */
  stuckAfterMs?: number;
  /** Refetch attempts before reloading the page. */
  maxRetries?: number;
};

/**
 * If schedule load hangs or fails, retry automatically and reload the page as a last resort.
 */
export const useStuckLoadRecovery = ({
  isLoading,
  isError,
  onRetry,
  stuckAfterMs = 22_000,
  maxRetries = 3,
}: StuckLoadRecoveryOptions) => {
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!isLoading && !isError) {
      retryCountRef.current = 0;
      return;
    }

    const timer = window.setTimeout(() => {
      retryCountRef.current += 1;

      if (retryCountRef.current < maxRetries) {
        onRetry();
        return;
      }

      const lastReload = Number(sessionStorage.getItem(RELOAD_STORAGE_KEY) || "0");
      const now = Date.now();
      if (now - lastReload < RELOAD_COOLDOWN_MS) return;

      sessionStorage.setItem(RELOAD_STORAGE_KEY, String(now));
      window.location.reload();
    }, stuckAfterMs);

    return () => window.clearTimeout(timer);
  }, [isLoading, isError, onRetry, stuckAfterMs, maxRetries]);
};
