"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { haptic } from "@/lib/haptics";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number; // px to trigger refresh
  containerRef?: React.RefObject<HTMLElement | null>;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 72,
  containerRef,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [triggered, setTriggered] = useState(false);

  const startYRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const hasTriggeredRef = useRef(false);

  const getScrollTop = useCallback(() => {
    if (containerRef?.current) return containerRef.current.scrollTop;
    return window.scrollY || document.documentElement.scrollTop;
  }, [containerRef]);

  const isAtTop = useCallback(() => getScrollTop() <= 0, [getScrollTop]);

  useEffect(() => {
    const el = containerRef?.current ?? window;

    const onTouchStart = (e: Event) => {
      const te = e as TouchEvent;
      if (!isAtTop()) return;
      startYRef.current = te.touches[0].clientY;
      isDraggingRef.current = true;
      hasTriggeredRef.current = false;
    };

    const onTouchMove = (e: Event) => {
      const te = e as TouchEvent;
      if (!isDraggingRef.current || startYRef.current === null) return;
      if (!isAtTop()) { isDraggingRef.current = false; setPullDistance(0); return; }

      const delta = te.touches[0].clientY - startYRef.current;
      if (delta <= 0) { setPullDistance(0); return; }

      // Rubber-band: slow down as we pull further
      const damped = Math.min(delta * 0.45, threshold * 1.4);
      setPullDistance(damped);

      if (damped >= threshold && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true;
        haptic("medium");
        setTriggered(true);
      } else if (damped < threshold) {
        setTriggered(false);
      }
    };

    const onTouchEnd = async () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      startYRef.current = null;

      if (triggered || hasTriggeredRef.current) {
        setIsRefreshing(true);
        setTriggered(false);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
      // Animate back
      setPullDistance(0);
      hasTriggeredRef.current = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [isAtTop, onRefresh, threshold, triggered, containerRef]);

  return { pullDistance, isRefreshing, triggered };
}
