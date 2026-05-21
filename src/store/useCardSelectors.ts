// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 + Phase 2 — Granular card selectors.
//
// Phase 1 shipped RAM-only selectors over `cardMapStore`. Phase 2 adds Dexie
// liveQuery siblings in `useCardSelectorsFromDb.ts` and routes both through a
// hybrid façade controlled by the `USE_DB_LIVE_SELECTORS` flag.
//
//   ┌── caller (View component) ─────────────────────────────────────┐
//   │  useCardsByCategory(id)   ← FAÇADE (this file)                 │
//   │       │                                                         │
//   │       ├── useCardsByCategoryRam(id)   (cardMapStore subscriber) │
//   │       └── useCardsByCategoryFromDb(id) (Dexie liveQuery)        │
//   │                                                                 │
//   │  Both hooks always run (stable hook order). Return value is     │
//   │  chosen by `isFeatureEnabled("USE_DB_LIVE_SELECTORS")`, which   │
//   │  is snapshot-stable for the session. In DEV, divergences are    │
//   │  diffed and logged once per (selector, key) to surface drift    │
//   │  during the dual-read validation window.                        │
//   └─────────────────────────────────────────────────────────────────┘
//
// Rules of Hooks: the flag is read ONCE per session (snapshot in
// `feature-flags.ts`), so the conditional return below is safe — hook order
// across renders is stable.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore, useRef, useEffect } from "react";
import { cardMapStore } from "./useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";
import type { CardMap } from "@/lib/persist-queue";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  useCardsByCategoryFromDb,
  useCardsBySubcategoryFromDb,
  useCardsByChapterFromDb,
  useCardCountByCategoryFromDb,
  useCardByIdFromDb,
} from "./useCardSelectorsFromDb";
import { logger } from "@/lib/logger";

const EMPTY: readonly Card[] = Object.freeze([]);

interface SelectorCache<K> {
  map: CardMap | null;
  key: K | undefined;
  result: readonly Card[];
}

/**
 * Build a card-set selector hook keyed on a single argument.
 *
 * @param predicate  Per-card matcher. Closes over the hook arg via `key`.
 * @param keyEq      Optional equality for the key (default: strict `===`).
 */
function createCardSetSelector<K>(
  predicate: (card: Card, key: K) => boolean,
  keyEq: (a: K | undefined, b: K | undefined) => boolean = Object.is,
) {
  return function useCardSet(key: K | undefined): readonly Card[] {
    const cache = useRef<SelectorCache<K>>({ map: null, key: undefined, result: EMPTY });

    return useSyncExternalStore(
      cardMapStore.subscribe,
      () => {
        if (key === undefined || key === null || key === ("" as unknown as K)) return EMPTY;
        const map = cardMapStore.getState().cardMap;

        // Same store snapshot + same key → reuse last result.
        if (cache.current.map === map && keyEq(cache.current.key, key)) {
          return cache.current.result;
        }

        const matched: Card[] = [];
        for (const id in map) {
          const c = map[id];
          if (predicate(c, key)) matched.push(c);
        }

        // Shallow-equal vs last result — if every matched card reference is
        // unchanged AND the key is unchanged, return prior array to suppress
        // re-render in pure-rerender scenarios (BroadcastChannel sync, etc).
        const prev = cache.current.result;
        const same =
          keyEq(cache.current.key, key) &&
          matched.length === prev.length &&
          matched.every((c, i) => c === prev[i]);

        const next = same ? prev : matched;
        cache.current = { map, key, result: next };
        return next;
      },
      () => EMPTY,
    );
  };
}

// ── Phase 1 — RAM selectors (still used as the fallback path) ──────────────

export const useCardsByCategoryRam = createCardSetSelector<string>(
  (c, id) => c.categoryId === id,
);
export const useCardsBySubcategoryRam = createCardSetSelector<string>(
  (c, id) => c.subcategoryId === id,
);
export const useCardsByChapterRam = createCardSetSelector<string>(
  (c, id) => c.chapterId === id,
);

export function useCardCountByCategoryRam(categoryId: string | undefined): number {
  return useSyncExternalStore(
    cardMapStore.subscribe,
    () => {
      if (!categoryId) return 0;
      const map = cardMapStore.getState().cardMap;
      let n = 0;
      for (const id in map) if (map[id].categoryId === categoryId) n++;
      return n;
    },
    () => 0,
  );
}

export function useCardByIdRam(id: string | undefined | null): Card | null {
  return useSyncExternalStore(
    cardMapStore.subscribe,
    () => {
      if (!id) return null;
      return cardMapStore.getState().cardMap[id] ?? null;
    },
    () => null,
  );
}

// ── Phase 2 — dual-read diff logger (DEV only) ─────────────────────────────

const DEV = Boolean(import.meta.env?.DEV);
const _loggedDivergence = new Set<string>();

function logDivergenceOnce(
  selector: string,
  key: string,
  ramLen: number,
  dbLen: number,
): void {
  if (!DEV) return;
  const tag = `${selector}:${key}:${ramLen}/${dbLen}`;
  if (_loggedDivergence.has(tag)) return;
  _loggedDivergence.add(tag);
  logger.warn(
    `[phase2-diff] ${selector}(${key}) RAM=${ramLen} IDB=${dbLen} — investigate drift`,
  );
}

function useDualReadDiff(
  selector: string,
  key: string | undefined | null,
  ram: readonly Card[],
  db: readonly Card[],
): void {
  useEffect(() => {
    if (!DEV || !key) return;
    if (ram.length !== db.length) {
      logDivergenceOnce(selector, key, ram.length, db.length);
      return;
    }
    // Shallow id-set comparison (cheap, no allocations beyond the Set).
    const ramIds = new Set(ram.map((c) => c.id));
    let mismatched = 0;
    for (const c of db) if (!ramIds.has(c.id)) mismatched++;
    if (mismatched > 0) logDivergenceOnce(selector, key, ram.length, db.length);
  }, [selector, key, ram, db]);
}

// ── Phase 2 — Hybrid façades (PUBLIC API) ──────────────────────────────────
//
// Both underlying hooks run on every render so hook order stays stable. The
// flag — snapshot-stable per session — selects which result is returned.

const USE_DB = isFeatureEnabled("USE_DB_LIVE_SELECTORS");

export function useCardsByCategory(categoryId: string | undefined): readonly Card[] {
  const ram = useCardsByCategoryRam(categoryId);
  const db = useCardsByCategoryFromDb(categoryId);
  useDualReadDiff("useCardsByCategory", categoryId, ram, db);
  return USE_DB ? db : ram;
}

export function useCardsBySubcategory(
  subcategoryId: string | undefined,
  categoryId?: string,
): readonly Card[] {
  const ram = useCardsBySubcategoryRam(subcategoryId);
  const db = useCardsBySubcategoryFromDb(subcategoryId, categoryId);
  useDualReadDiff("useCardsBySubcategory", subcategoryId, ram, db);
  return USE_DB ? db : ram;
}

export function useCardsByChapter(
  chapterId: string | undefined,
  categoryId?: string,
): readonly Card[] {
  const ram = useCardsByChapterRam(chapterId);
  const db = useCardsByChapterFromDb(chapterId, categoryId);
  useDualReadDiff("useCardsByChapter", chapterId, ram, db);
  return USE_DB ? db : ram;
}

export function useCardCountByCategory(categoryId: string | undefined): number {
  const ram = useCardCountByCategoryRam(categoryId);
  const db = useCardCountByCategoryFromDb(categoryId);
  // Cheap primitive diff — no useEffect needed.
  if (DEV && categoryId && ram !== db) {
    logDivergenceOnce("useCardCountByCategory", categoryId, ram, db);
  }
  return USE_DB ? db : ram;
}

export function useCardById(id: string | undefined | null): Card | null {
  const ram = useCardByIdRam(id);
  const db = useCardByIdFromDb(id);
  if (DEV && id && ram && db && ram.id !== db.id) {
    logDivergenceOnce("useCardById", id, ram ? 1 : 0, db ? 1 : 0);
  }
  return USE_DB ? db : ram;
}
