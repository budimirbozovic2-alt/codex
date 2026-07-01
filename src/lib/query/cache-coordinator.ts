/**
 * Unified TanStack cache coordinator — cards, categories, review log, SR settings.
 * TD-ARCH-4: replaces cards-/categories-/review-settings-cache-coordinator.
 */
import type { CategoryRecord } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import {
  listAllCards,
  countAllCards,
  notifyCardsChanged,
  listAllCategories,
  countCategories,
} from "@/lib/db/queries";
import { settingsRepository, reviewLogRepository } from "@/lib/repositories";
import { invalidateCategoriesCache } from "@/lib/query/categories-invalidation";
import { logger } from "@/lib/logger";
import { queryClient } from "./client";
import { queryKeys } from "./keys";
import { runAuthoritativeWrite } from "./authoritative-write";

export const REVIEW_LOG_BOOT_DAYS = 90;
const REVIEW_LOG_CAP = 5000;

// ── Cards ────────────────────────────────────────────────────────────────

let cardsCacheWriteGeneration = 0;
let cardsHydrated = false;
const cardsHydrationListeners = new Set<() => void>();

function emitCardsHydrationChange(): void {
  for (const listener of cardsHydrationListeners) listener();
}

export function resetCardsQueryCache(): void {
  queryClient.removeQueries({ queryKey: queryKeys.cards.root });
  cardsHydrated = false;
  emitCardsHydrationChange();
}

export function getCardsCacheWriteGeneration(): number {
  return cardsCacheWriteGeneration;
}

export function getCardsHydrated(): boolean {
  return cardsHydrated;
}

export function subscribeCardsHydrated(listener: () => void): () => void {
  cardsHydrationListeners.add(listener);
  return () => cardsHydrationListeners.delete(listener);
}

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
  emitCardsHydrationChange();
  return true;
}

function logCardsDecodeGap(decoded: number, sqlCount: number, context: string): void {
  if (sqlCount > 0 && decoded < sqlCount) {
    logger.error(`[cache-coordinator:cards] decode gap (${context})`, {
      decoded,
      sqlCount,
      missing: sqlCount - decoded,
    });
  }
}

function invalidateDerivedCardQueries(): void {
  notifyCardsChanged({ kind: "derived" });
}

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

export async function commitCardsWriteFromDb(
  writeGen?: number,
): Promise<number> {
  const [cards, sqlCount] = await Promise.all([
    listAllCards(),
    countAllCards(),
  ]);
  logCardsDecodeGap(cards.length, sqlCount, "commitCardsWriteFromDb");
  if (writeGen !== undefined) {
    if (!seedCardsQueryCache(cards, writeGen, sqlCount)) return -1;
  } else {
    seedCardsQueryCache(cards, undefined, sqlCount);
  }
  invalidateDerivedCardQueries();
  return sqlCount;
}

export async function abortCardsWrite(): Promise<number> {
  return commitCardsWriteFromDb();
}

export function commitDeferredBootSeed(
  cards: readonly Card[],
  writeGenAtStart: number,
): boolean {
  return seedCardsQueryCache(cards, writeGenAtStart);
}

export async function ensureCardsBootCache(
  writeGenAtStart: number,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) return -1;
  if (writeGenAtStart !== cardsCacheWriteGeneration) return -1;

  const [cards, sqlCount] = await Promise.all([
    listAllCards(),
    countAllCards(),
  ]);

  if (signal?.aborted) return -1;
  if (writeGenAtStart !== cardsCacheWriteGeneration) return -1;

  logCardsDecodeGap(cards.length, sqlCount, "ensureCardsBootCache");
  queryClient.setQueryData(queryKeys.cards.all(), cards);
  queryClient.setQueryData(queryKeys.cards.countAll(), sqlCount);
  cardsHydrated = true;
  emitCardsHydrationChange();
  return sqlCount;
}

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

// ── Categories ───────────────────────────────────────────────────────────

let categoriesCacheWriteGeneration = 0;
let categoriesHydrated = false;
const categoriesHydrationListeners = new Set<() => void>();

function emitCategoriesHydrationChange(): void {
  for (const listener of categoriesHydrationListeners) listener();
}

export function resetCategoriesQueryCache(): void {
  queryClient.removeQueries({ queryKey: queryKeys.categories.root });
  categoriesHydrated = false;
  emitCategoriesHydrationChange();
}

export function getCategoriesCacheWriteGeneration(): number {
  return categoriesCacheWriteGeneration;
}

export function getCategoriesHydrated(): boolean {
  return categoriesHydrated;
}

export function subscribeCategoriesHydrated(listener: () => void): () => void {
  categoriesHydrationListeners.add(listener);
  return () => categoriesHydrationListeners.delete(listener);
}

export function beginCategoriesWrite(): number {
  categoriesCacheWriteGeneration += 1;
  void queryClient.cancelQueries({ queryKey: queryKeys.categories.root });
  return categoriesCacheWriteGeneration;
}

export function seedCategoriesQueryCache(
  records: readonly CategoryRecord[],
  writeGen?: number,
  sqlCount?: number,
): boolean {
  if (writeGen !== undefined && writeGen !== categoriesCacheWriteGeneration) {
    return false;
  }
  queryClient.setQueryData(queryKeys.categories.all(), records);
  queryClient.setQueryData(
    queryKeys.categories.countAll(),
    sqlCount ?? records.length,
  );
  categoriesHydrated = true;
  emitCategoriesHydrationChange();
  return true;
}

export function commitCategoriesWriteFromRows(
  records: readonly CategoryRecord[],
  writeGen?: number,
): boolean {
  const seeded = seedCategoriesQueryCache(records, writeGen);
  if (seeded) {
    invalidateCategoriesCache();
  }
  return seeded;
}

export async function commitCategoriesWriteFromDb(
  writeGen?: number,
): Promise<number> {
  const [records, sqlCount] = await Promise.all([
    listAllCategories(),
    countCategories(),
  ]);
  if (writeGen !== undefined) {
    if (!seedCategoriesQueryCache(records, writeGen, sqlCount)) return -1;
  } else {
    seedCategoriesQueryCache(records, undefined, sqlCount);
  }
  invalidateCategoriesCache();
  return sqlCount;
}

export async function abortCategoriesWrite(): Promise<number> {
  return commitCategoriesWriteFromDb();
}

export async function ensureCategoriesBootCache(
  writeGenAtStart: number,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) return -1;
  if (writeGenAtStart !== categoriesCacheWriteGeneration) return -1;

  const [records, sqlCount] = await Promise.all([
    listAllCategories(),
    countCategories(),
  ]);

  if (signal?.aborted) return -1;
  if (writeGenAtStart !== categoriesCacheWriteGeneration) return -1;

  queryClient.setQueryData(queryKeys.categories.all(), records);
  queryClient.setQueryData(queryKeys.categories.countAll(), sqlCount);
  categoriesHydrated = true;
  emitCategoriesHydrationChange();
  return sqlCount;
}

export function getCategoriesFromQueryCache(): readonly CategoryRecord[] {
  return (
    queryClient.getQueryData<readonly CategoryRecord[]>(
      queryKeys.categories.all(),
    ) ?? []
  );
}

export async function runAuthoritativeCategoriesWrite<T>(
  work: (generation: number) => Promise<T>,
): Promise<T> {
  return runAuthoritativeWrite(
    beginCategoriesWrite,
    (gen) => commitCategoriesWriteFromDb(gen),
    () => abortCategoriesWrite(),
    work,
  );
}

// ── Review log + SR settings ─────────────────────────────────────────────

let reviewLogWriteGeneration = 0;

export function resetReviewSettingsQueryCache(): void {
  queryClient.removeQueries({ queryKey: queryKeys.review.root });
  queryClient.removeQueries({ queryKey: queryKeys.settings.root });
}

export function getReviewLogCacheWriteGeneration(): number {
  return reviewLogWriteGeneration;
}

export function beginReviewLogWrite(): number {
  reviewLogWriteGeneration += 1;
  void queryClient.cancelQueries({ queryKey: queryKeys.review.root });
  return reviewLogWriteGeneration;
}

export function seedReviewLogCache(
  entries: readonly ReviewLogEntry[],
  days: number = REVIEW_LOG_BOOT_DAYS,
  writeGen?: number,
): boolean {
  if (writeGen !== undefined && writeGen !== reviewLogWriteGeneration) {
    return false;
  }
  queryClient.setQueryData(queryKeys.review.logRecent(days), [...entries]);
  return true;
}

export function seedSrSettingsCache(settings: SRSettings): void {
  queryClient.setQueryData(queryKeys.settings.sr(), settings);
}

export async function commitReviewLogFromDb(
  days: number = REVIEW_LOG_BOOT_DAYS,
  writeGen?: number,
): Promise<number> {
  const entries = await reviewLogRepository.loadRecent(days);
  if (writeGen !== undefined) {
    if (!seedReviewLogCache(entries, days, writeGen)) return -1;
  } else {
    seedReviewLogCache(entries, days);
  }
  return entries.length;
}

export async function abortReviewLogWrite(
  days: number = REVIEW_LOG_BOOT_DAYS,
): Promise<number> {
  return commitReviewLogFromDb(days);
}

export function appendReviewLogOptimistic(entry: ReviewLogEntry): void {
  const key = queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS);
  const prev = queryClient.getQueryData<ReviewLogEntry[]>(key) ?? [];
  const next = [...prev, entry];
  queryClient.setQueryData(
    key,
    next.length > REVIEW_LOG_CAP ? next.slice(-REVIEW_LOG_CAP) : next,
  );
}

export function replaceReviewLogCache(
  entries: readonly ReviewLogEntry[],
  days: number = REVIEW_LOG_BOOT_DAYS,
): void {
  queryClient.setQueryData(queryKeys.review.logRecent(days), [...entries]);
}

export function getSrSettingsSnapshot(): SRSettings {
  return (
    queryClient.getQueryData<SRSettings>(queryKeys.settings.sr()) ??
    DEFAULT_SR_SETTINGS
  );
}

export async function commitSrSettings(settings: SRSettings): Promise<void> {
  const prev = getSrSettingsSnapshot();
  queryClient.setQueryData(queryKeys.settings.sr(), settings);
  try {
    await settingsRepository.save("srSettings", settings);
  } catch (err) {
    queryClient.setQueryData(queryKeys.settings.sr(), prev);
    throw err;
  }
}

export function updateSrSettings(settings: SRSettings): void {
  void commitSrSettings(settings);
}

if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.accept(() => {
    resetCardsQueryCache();
    resetCategoriesQueryCache();
    resetReviewSettingsQueryCache();
  });
}
