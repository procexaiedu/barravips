"use client";

import { useEffect, useRef, useState } from "react";

type UseCountUpOptions = {
  durationMs?: number;
  decimals?: number;
};

export function useCountUp(target: number, options: UseCountUpOptions = {}): number {
  const { durationMs = 900, decimals = 0 } = options;
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) {
      setValue(target);
      return;
    }

    let frameId = 0;
    const startedAt = performance.now();
    const origin = valueRef.current;
    const delta = target - origin;

    if (Math.abs(delta) < Number.EPSILON) {
      setValue(target);
      return;
    }

    const tick = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - elapsed, 4);
      const nextValue = origin + delta * eased;
      setValue(roundTo(nextValue, decimals));
      if (elapsed < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [decimals, durationMs, target]);

  return roundTo(value, decimals);
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
