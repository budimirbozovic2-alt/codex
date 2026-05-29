import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// easeOutCubic
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Animates a numeric value from 0 (or `from`) to `value` over `duration` ms.
 * Honors prefers-reduced-motion (snaps immediately).
 * Re-animates whenever `value` changes.
 */
export function useCountUp(
  value: number,
  opts: { duration?: number; from?: number; decimals?: number } = {}
): number {
  const { duration = 600, from = 0, decimals = 0 } = opts;
  const [display, setDisplay] = useState<number>(value);
  const startRef = useRef<number>(from);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion() || duration <= 0) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const initial = startRef.current;
    const delta = value - initial;
    if (delta === 0) {
      setDisplay(value);
      return;
    }
    const factor = Math.pow(10, decimals);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const next = initial + delta * ease(t);
      setDisplay(Math.round(next * factor) / factor);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        startRef.current = value;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration, decimals]);

  return display;
}
