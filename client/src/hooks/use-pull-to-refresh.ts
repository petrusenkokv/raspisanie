import { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 72;
const MAX_PULL = 110;

const hasOpenOverlay = () =>
  !!document.querySelector(
    '[data-radix-dialog-overlay][data-state="open"], [data-radix-sheet-overlay][data-state="open"]',
  );

const isIgnoredTarget = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;
  return !!target.closest("[data-pull-ignore]");
};

export function usePullToRefresh(onRefresh: () => Promise<void>, enabled = true) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    if (!("ontouchstart" in window)) return;

    const setPull = (value: number) => {
      pullDistanceRef.current = value;
      setPullDistance(value);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (refreshing || hasOpenOverlay() || isIgnoredTarget(e.target)) return;
      if (window.scrollY > 1) return;
      startYRef.current = e.touches[0]?.clientY ?? 0;
      pullingRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshing) return;
      if (window.scrollY > 1) {
        pullingRef.current = false;
        setPull(0);
        return;
      }
      const y = e.touches[0]?.clientY ?? startYRef.current;
      const dy = y - startYRef.current;
      if (dy <= 0) {
        setPull(0);
        return;
      }
      if (dy > 8 && e.cancelable) {
        e.preventDefault();
      }
      setPull(Math.min(dy * 0.45, MAX_PULL));
    };

    const finishPull = async () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      const distance = pullDistanceRef.current;
      if (distance >= PULL_THRESHOLD) {
        setRefreshing(true);
        setPull(PULL_THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          setRefreshing(false);
          setPull(0);
        }
        return;
      }
      setPull(0);
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", finishPull);
    document.addEventListener("touchcancel", finishPull);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", finishPull);
      document.removeEventListener("touchcancel", finishPull);
    };
  }, [enabled, refreshing]);

  return {
    pullDistance,
    refreshing,
    threshold: PULL_THRESHOLD,
    isPulling: pullDistance > 0 || refreshing,
  };
}
