import { useCallback, useEffect, useRef, useState } from "react";

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



function resolveInitialIndex(cards: Card[], filtered: Card[], initialCardId: string): number {

  const direct = filtered.findIndex(c => c.id === initialCardId);

  if (direct >= 0) return direct;



  const target = cards.find(c => c.id === initialCardId);

  if (target?.parentId) {

    const parentIdx = filtered.findIndex(c => c.id === target.parentId);

    if (parentIdx >= 0) return parentIdx;

  }

  return -1;

}



export function usePassiveReaderNavigation({

  cards, filtered, filters, initialCardId, onInitialConsumed,

}: Args) {

  const [index, setIndex] = useState(0);

  const cardsRef = useRef(cards);

  cardsRef.current = cards;



  const applyIndex = useCallback((updater: number | ((prev: number) => number)) => {

    setIndex(updater);

  }, []);



  useEffect(() => {

    applyIndex(0);

  }, [filters.subFilter, filters.chapterFilter, filters.typeFilter, applyIndex]);



  useEffect(() => {

    if (index > 0 && index >= filtered.length) {

      applyIndex(Math.max(0, filtered.length - 1));

    }

  }, [filtered.length, index, applyIndex]);



  const consumedRef = useRef<string | null>(null);

  const resetAttemptRef = useRef<string | null>(null);

  const resetAll = filters.resetAll;

  useEffect(() => {

    if (!initialCardId || consumedRef.current === initialCardId) return;



    const liveCards = cardsRef.current;

    const exists = liveCards.find(c => c.id === initialCardId);

    if (!exists) {

      consumedRef.current = initialCardId;

      resetAttemptRef.current = null;

      onInitialConsumed?.();

      return;

    }



    const idx = resolveInitialIndex(liveCards, filtered, initialCardId);

    if (idx === -1) {

      if (resetAttemptRef.current !== initialCardId) {

        resetAttemptRef.current = initialCardId;

        resetAll();

      }

      return;

    }



    resetAttemptRef.current = null;

    applyIndex(idx);

    consumedRef.current = initialCardId;

    onInitialConsumed?.();

  }, [initialCardId, filtered, resetAll, onInitialConsumed, applyIndex]);



  useGlobalHotkey(

    e => e.key === "ArrowRight" || e.key === "ArrowLeft",

    e => {

      if (e.key === "ArrowRight") {

        applyIndex(prev => Math.min(prev + 1, Math.max(0, filtered.length - 1)));

      } else {

        applyIndex(prev => Math.max(prev - 1, 0));

      }

    },

    [filtered.length, applyIndex],

    { ignoreInEditable: true },

  );



  const next = useCallback(() => {

    applyIndex(prev => Math.min(prev + 1, Math.max(0, filtered.length - 1)));

  }, [filtered.length, applyIndex]);



  const prev = useCallback(() => {

    applyIndex(prev => Math.max(prev - 1, 0));

  }, [applyIndex]);



  return { index, next, prev };

}


