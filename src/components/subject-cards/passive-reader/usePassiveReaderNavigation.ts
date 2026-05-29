import { useEffect, useRef, useState } from "react";
import { useGlobalHotkey } from "@/hooks/useGlobalHotkey";
import type { Card } from "@/lib/spaced-repetition";
import type { PassiveReaderFiltersAPI } from "./usePassiveReaderFilters";

interface Args {
  cards: Card[];
  filtered: Card[];
  filters: PassiveReaderFiltersAPI;
  initialCardId?: string | null;
  onInitialConsumed?: () => void;
}

export function usePassiveReaderNavigation({
  cards, filtered, filters, initialCardId, onInitialConsumed,
}: Args) {
  const [index, setIndex] = useState(0);

  // Reset index when filters change.
  useEffect(() => { setIndex(0); }, [filters.subFilter, filters.chapterFilter, filters.typeFilter]);

  // Clamp index if list shrinks.
  useEffect(() => {
    if (index > 0 && index >= filtered.length) setIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, index]);

  // External focus request — two-phase: clear filters, then jump.
  const consumedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialCardId || consumedRef.current === initialCardId) return;
    const exists = cards.find(c => c.id === initialCardId);
    if (!exists) {
      consumedRef.current = initialCardId;
      onInitialConsumed?.();
      return;
    }
    const idx = filtered.findIndex(c => c.id === initialCardId);
    if (idx === -1) {
      filters.resetAll();
      return;
    }
    setIndex(idx);
    consumedRef.current = initialCardId;
    onInitialConsumed?.();
  }, [initialCardId, cards, filtered, filters, onInitialConsumed]);

  useGlobalHotkey(
    e => e.key === "ArrowRight" || e.key === "ArrowLeft",
    e => {
      if (e.key === "ArrowRight") setIndex(i => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      else setIndex(i => Math.max(i - 1, 0));
    },
    [filtered.length],
    { ignoreInEditable: true },
  );

  return {
    index,
    next: () => setIndex(i => Math.min(i + 1, Math.max(0, filtered.length - 1))),
    prev: () => setIndex(i => Math.max(i - 1, 0)),
  };
}
