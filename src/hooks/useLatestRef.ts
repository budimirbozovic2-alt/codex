import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Always-fresh ref to the latest value.
 *
 * Replaces the manual `const xRef = useRef(x); useEffect(() => { xRef.current = x }, [x])`
 * pattern that's easy to forget when adding a new field. Use inside callbacks
 * that need the latest value without re-creating their identity on every keystroke.
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
