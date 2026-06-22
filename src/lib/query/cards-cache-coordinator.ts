/**
 * Single entry point for authoritative TanStack card-cache writes.
 * Replaces ad-hoc seed + notify + generation-guard combinations.
 */
import type { Card } from "@/lib/spaced-repetition";
import { listAllCards, countAllCards, notifyCardsChanged } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { queryClient } from "./client";
import { queryKeys } from "./keys";
import { runAuthoritativeWrite } from "./authoritative-write";

let cardsCacheWriteGeneration = 0;
let cardsHydrated = false;
const hydrationListeners = new Set<() => void>();

function emitHydrationChange(): void {
  for (const listener of hydrationListeners) listener();
}

export function resetCardsQueryCache(): void {
  queryClient.removeQueries({ queryKey: queryKeys.cards.root });
  cardsHydrated = false;
  emitHydrationChange();
}

export function getCardsCacheWriteGeneration(): number {
  return cardsCacheWriteGeneration;
}

export function getCardsHydrated(): boolean {
  return cardsHydrated;
}

export function subscribeCardsHydrated(listener: () => void): () => void {
  hydrationListeners.add(listener);
  return () => hydrationListeners.delete(listener);
}

/** Mark start of an authoritative SQLite cards write (import, bulk put). */
export function beginCardsWrite(): number {
  cardsCacheWriteGeneration += 1;
  void queryClient.cancelQueries({ queryKey: queryKeys.cards.root });
  return cardsCacheWriteGeneration;
}

export function seedCardsQueryCache(
  cards: readonly Card[],
  writeGen?: number,
  sqlCount?: number,
): boolean {
  if (writeGen !== undefined && writeGen !== cardsCacheWriteGeneration) {
    return false;
  }
  queryClient.setQueryData(queryKeys.cards.all(), cards);
  queryClient.setQueryData(queryKeys.cards.countAll(), sqlCount ?? cards.length);
  cardsHydrated = true;
  emitHydrationChange();
  return true;
}

function logDecodeGap(decoded: number, sqlCount: number, context: string): void {
  if (sqlCount > 0 && decoded < sqlCount) {
    logger.error(`[cards-cache] decode gap (${context})`, {
      decoded,
      sqlCount,
      missing: sqlCount - decoded,
    });
  }
}

function invalidateDerivedCardQueries(): void {
  notifyCardsChanged({ kind: "derived" });
}

/** Seed TanStack from known rows; optionally notify derived queries. */
export function commitCardsWriteFromRows(
  cards: readonly Card[],
  writeGen?: number,
  options?: { notifyDerived?: boolean },
): boolean {
  const seeded = seedCardsQueryCache(cards, writeGen);
  if (seeded && options?.notifyDerived !== false) {
    invalidateDerivedCardQueries();
  }
  return seeded;
}

/** Read SQLite, seed TanStack, notify derived queries once. */
export async function commitCardsWriteFromDb(
  writeGen?: number,
): Promise<number> {
  const [cards, sqlCount] = await Promise.all([
    listAllCards(),
    countAllCards(),
  ]);
  logDecodeGap(cards.length, sqlCount, "commitCardsWriteFromDb");
  if (writeGen !== undefined) {
    if (!seedCardsQueryCache(cards, writeGen, sqlCount)) return -1;
  } else {
    seedCardsQueryCache(cards, undefined, sqlCount);
  }
  invalidateDerivedCardQueries();
  return sqlCount;
}

/** Resync cache after failed write or boot error (ignores generation guard). */
export async function abortCardsWrite(): Promise<number> {
  return commitCardsWriteFromDb();
}

/** Deferred boot seed — skips when a concurrent import bumped generation. */
export function commitDeferredBootSeed(
  cards: readonly Card[],
  writeGenAtStart: number,
): boolean {
  return seedCardsQueryCache(cards, writeGenAtStart);
}

/**
 * Boot-critical path: one SQLite read via TanStack `ensureQueryData`, then
 * mark cache hydrated before boot FSM reaches READY.
 * Skips when a concurrent import bumped {@link cardsCacheWriteGeneration}.
 */
export async function ensureCardsBootCache(
  writeGenAtStart: number,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) return -1;
  if (writeGenAtStart !== cardsCacheWriteGeneration) return -1;

  // Always read SQLite directly on boot — never trust a stale TanStack cache
  // that another component may have seeded via fetchQuery during splash.
  const [cards, sqlCount] = await Promise.all([
    listAllCards(),
    countAllCards(),
  ]);

  if (signal?.aborted) return -1;
  if (writeGenAtStart !== cardsCacheWriteGeneration) return -1;

  logDecodeGap(cards.length, sqlCount, "ensureCardsBootCache");
  queryClient.setQueryData(queryKeys.cards.all(), cards);
  queryClient.setQueryData(queryKeys.cards.countAll(), sqlCount);
  cardsHydrated = true;
  emitHydrationChange();
  return sqlCount;
}

/** Read authoritative boot snapshot already in TanStack (no SQLite round-trip). */
export function getCardsFromQueryCache(): readonly Card[] {
  return queryClient.getQueryData<readonly Card[]>(queryKeys.cards.all()) ?? [];
}

export async function runAuthoritativeCardsWrite<T>(
  work: (generation: number) => Promise<T>,
): Promise<T> {
  return runAuthoritativeWrite(
    beginCardsWrite,
    (gen) => commitCardsWriteFromDb(gen),
    () => abortCardsWrite(),
    work,
  );
}

if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.accept(() => {
    resetCardsQueryCache();
  });
}
