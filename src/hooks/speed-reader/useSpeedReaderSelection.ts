/**
 * SSOT for LocalSpeedReader card selection.
 *
 * One reducer holds {subFilter, chapterFilter, typeFilter, index}.
 * All invariants (chapter belongs to sub, index in [0, len-1], stale UUIDs cleared)
 * are enforced inside the reducer, not by chained useEffects.
 *
 * Two side effects only:
 *   1) persist the filter triple to localStorage when it changes
 *   2) reconcile against fresh taxonomy / cards / initialCardId
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Card } from "@/lib/spaced-repetition";
import type { SubcategoryNode } from "@/lib/db-types";

export type TypeFilter = "all" | "essay" | "flash";

export interface SelectionState {
  subFilter: string;
  chapterFilter: string;
  typeFilter: TypeFilter;
  index: number;
}

const FILTER_KEY = "speed-reader-filters:";

function loadFilters(categoryId: string): Omit<SelectionState, "index"> {
  try {
    const raw = localStorage.getItem(FILTER_KEY + categoryId);
    if (!raw) return { subFilter: "all", chapterFilter: "all", typeFilter: "all" };
    const p = JSON.parse(raw) as Partial<SelectionState>;
    const tf = p.typeFilter;
    return {
      subFilter: typeof p.subFilter === "string" ? p.subFilter : "all",
      chapterFilter: typeof p.chapterFilter === "string" ? p.chapterFilter : "all",
      typeFilter: tf === "essay" || tf === "flash" ? tf : "all",
    };
  } catch {
    return { subFilter: "all", chapterFilter: "all", typeFilter: "all" };
  }
}

type Action =
  | { type: "SET_SUB"; value: string }
  | { type: "SET_CHAPTER"; value: string }
  | { type: "SET_TYPE"; value: TypeFilter }
  | { type: "RESET_ALL" }
  | { type: "JUMP_TO"; value: number; max: number }
  | { type: "STEP"; delta: number; max: number }
  | {
      type: "RECONCILE";
      nodes: SubcategoryNode[];
      filteredLen: number;
      forcedIndex?: number;
      forcedFilters?: Partial<Pick<SelectionState, "subFilter" | "chapterFilter" | "typeFilter">>;
    };

function clampIndex(idx: number, len: number): number {
  if (len <= 0) return 0;
  if (idx < 0) return 0;
  if (idx >= len) return len - 1;
  return idx;
}

function reducer(state: SelectionState, action: Action): SelectionState {
  switch (action.type) {
    case "SET_SUB":
      if (state.subFilter === action.value) return state;
      return { ...state, subFilter: action.value, chapterFilter: "all", index: 0 };
    case "SET_CHAPTER":
      if (state.chapterFilter === action.value) return state;
      return { ...state, chapterFilter: action.value, index: 0 };
    case "SET_TYPE":
      if (state.typeFilter === action.value) return state;
      return { ...state, typeFilter: action.value, index: 0 };
    case "RESET_ALL":
      if (
        state.subFilter === "all" &&
        state.chapterFilter === "all" &&
        state.typeFilter === "all" &&
        state.index === 0
      ) return state;
      return { subFilter: "all", chapterFilter: "all", typeFilter: "all", index: 0 };
    case "JUMP_TO": {
      const next = clampIndex(action.value, action.max);
      return next === state.index ? state : { ...state, index: next };
    }
    case "STEP": {
      const next = clampIndex(state.index + action.delta, action.max);
      return next === state.index ? state : { ...state, index: next };
    }
    case "RECONCILE": {
      let sub = state.subFilter;
      let chap = state.chapterFilter;
      let typ = state.typeFilter;

      if (action.forcedFilters) {
        if (action.forcedFilters.subFilter !== undefined) sub = action.forcedFilters.subFilter;
        if (action.forcedFilters.chapterFilter !== undefined) chap = action.forcedFilters.chapterFilter;
        if (action.forcedFilters.typeFilter !== undefined) typ = action.forcedFilters.typeFilter;
      }

      // Stale sub UUID -> drop sub + chapter
      if (sub !== "all" && !action.nodes.some(n => n.id === sub)) {
        sub = "all";
        chap = "all";
      }
      // Stale chapter UUID -> drop chapter
      if (chap !== "all") {
        const node = action.nodes.find(n => n.id === sub);
        if (!node?.chapters?.some(c => c.id === chap)) chap = "all";
      }

      const idx =
        action.forcedIndex !== undefined
          ? clampIndex(action.forcedIndex, action.filteredLen)
          : clampIndex(state.index, action.filteredLen);

      if (
        sub === state.subFilter &&
        chap === state.chapterFilter &&
        typ === state.typeFilter &&
        idx === state.index
      ) return state;

      return { subFilter: sub, chapterFilter: chap, typeFilter: typ, index: idx };
    }
    default:
      return state;
  }
}

interface Params {
  cards: Card[];
  subcategoryNodes: SubcategoryNode[];
  categoryId: string;
  initialCardId?: string | null;
  onInitialConsumed?: () => void;
}

export function useSpeedReaderSelection({
  cards,
  subcategoryNodes,
  categoryId,
  initialCardId,
  onInitialConsumed,
}: Params) {
  const [state, dispatch] = useReducer(
    reducer,
    categoryId,
    (cid): SelectionState => ({ ...loadFilters(cid), index: 0 }),
  );

  const { subFilter, chapterFilter, typeFilter, index } = state;

  // Derived: chapter list for the active sub
  const chapters = useMemo(() => {
    if (subFilter === "all") return [];
    return subcategoryNodes.find(s => s.id === subFilter)?.chapters ?? [];
  }, [subFilter, subcategoryNodes]);

  // Derived: filtered + sorted cards
  const filtered = useMemo(() => {
    let list = cards.slice();
    if (subFilter !== "all") list = list.filter(c => c.subcategoryId === subFilter);
    if (chapterFilter !== "all") list = list.filter(c => c.chapterId === chapterFilter);
    if (typeFilter !== "all") list = list.filter(c => c.type === typeFilter);
    return list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  }, [cards, subFilter, chapterFilter, typeFilter]);

  const current = filtered[index];

  // Persist filter triple
  useEffect(() => {
    try {
      localStorage.setItem(
        FILTER_KEY + categoryId,
        JSON.stringify({ subFilter, chapterFilter, typeFilter }),
      );
    } catch { /* ignore */ }
  }, [categoryId, subFilter, chapterFilter, typeFilter]);

  // Reconcile against fresh taxonomy / card list / initialCardId
  const consumedRef = useRef<string | null>(null);
  useEffect(() => {
    // initialCardId path: jump to the card, dropping filters that hide it
    if (initialCardId && consumedRef.current !== initialCardId) {
      const target = cards.find(c => c.id === initialCardId);
      if (!target) {
        consumedRef.current = initialCardId;
        onInitialConsumed?.();
        // still reconcile below with no forced index
      } else {
        const idxInFiltered = filtered.findIndex(c => c.id === initialCardId);
        if (idxInFiltered === -1) {
          // Drop filters and re-target on next pass (filtered will recompute)
          dispatch({
            type: "RECONCILE",
            nodes: subcategoryNodes,
            filteredLen: filtered.length,
            forcedFilters: { subFilter: "all", chapterFilter: "all", typeFilter: "all" },
          });
          return;
        }
        dispatch({
          type: "RECONCILE",
          nodes: subcategoryNodes,
          filteredLen: filtered.length,
          forcedIndex: idxInFiltered,
        });
        consumedRef.current = initialCardId;
        onInitialConsumed?.();
        return;
      }
    }

    // Plain reconcile (taxonomy / list shrink)
    dispatch({
      type: "RECONCILE",
      nodes: subcategoryNodes,
      filteredLen: filtered.length,
    });
  }, [subcategoryNodes, filtered, cards, initialCardId, onInitialConsumed]);

  const setSub = useCallback((v: string) => dispatch({ type: "SET_SUB", value: v }), []);
  const setChapter = useCallback((v: string) => dispatch({ type: "SET_CHAPTER", value: v }), []);
  const setType = useCallback((v: TypeFilter) => dispatch({ type: "SET_TYPE", value: v }), []);
  const resetAll = useCallback(() => dispatch({ type: "RESET_ALL" }), []);
  const jumpTo = useCallback(
    (i: number) => dispatch({ type: "JUMP_TO", value: i, max: filtered.length }),
    [filtered.length],
  );
  const next = useCallback(
    () => dispatch({ type: "STEP", delta: +1, max: filtered.length }),
    [filtered.length],
  );
  const prev = useCallback(
    () => dispatch({ type: "STEP", delta: -1, max: filtered.length }),
    [filtered.length],
  );

  return {
    subFilter, chapterFilter, typeFilter, index,
    chapters, filtered, current,
    setSub, setChapter, setType, resetAll,
    jumpTo, next, prev,
  };
}
