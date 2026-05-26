// ─────────────────────────────────────────────────────────────────────────────
// Card Repository — single source of truth for card mutations.
//
// Post Task-B: the EventBus CARDS_UPDATED fan-out has been removed. Every
// write mutates the Zustand `cardMapStore` inline, which is the SSOT all
// consumers subscribe to via `useSyncExternalStore`. The previous self/
// external "invalidator" dance is replaced by an explicit `reloadCardsFromIdb`
// helper that external callers (HealthMonitor, RemapFromBackupDialog) invoke
// directly when they bypass the repository to write to IDB.
// ─────────────────────────────────────────────────────────────────────────────
import type { Card } from "@/lib/spaced-repetition";
import { invalidateCoverageCache } from "@/lib/coverage-analysis";
import { sameSourceModules } from "@/lib/struct-eq";
import {
  schedulePersist,
  persistQueue,
  type CardMap,
} from "@/lib/persist-queue";
import {
  setCardMap,
  getCardMap,
} from "@/store/useCardMapStore";
import { db } from "@/lib/db";
import { idbLoadCards } from "@/lib/db-queries";
import { logger } from "@/lib/logger";

// ─── Read primitives ──────────────────────────────────────────────────────
export function getCard(id: string): Card | undefined {
  return getCardMap()[id];
}

export function snapshot(): CardMap {
  return getCardMap();
}

// ─── Internal helpers ─────────────────────────────────────────────────────
function commitSingle(card: Card): void {
  schedulePersist({ type: "put", card });
  setCardMap((prev) => ({ ...prev, [card.id]: card }));
}

function commitBulk(cards: Card[]): void {
  if (cards.length === 0) return;
  schedulePersist({ type: "bulk", cards });
  setCardMap((prev) => {
    const next = { ...prev };
    for (const c of cards) next[c.id] = c;
    return next;
  });
}

function commitDelete(id: string): void {
  schedulePersist({ type: "delete", id });
  setCardMap((prev) => {
    if (!(id in prev)) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
}

// ─── Write primitives ─────────────────────────────────────────────────────

/** Insert or replace a card. Stamps `updatedAt`. */
export function put(card: Card): void {
  const stamped = card.updatedAt ? card : { ...card, updatedAt: Date.now() };
  commitSingle(stamped);
}

/** Bulk insert/replace. Stamps `updatedAt` on entries that lack it. */
export function bulkPut(cards: Card[]): void {
  if (cards.length === 0) return;
  const now = Date.now();
  const stamped = cards.map((c) => (c.updatedAt ? c : { ...c, updatedAt: now }));
  commitBulk(stamped);
}

/** Delete a card by id. Invalidates coverage cache for any linked source. */
export function remove(id: string): void {
  const card = getCardMap()[id];
  if (card?.sourceId) invalidateCoverageCache(card.sourceId);
  commitDelete(id);
}

/**
 * Apply a structural patch to a single card. Invalidates coverage cache only
 * if the linked-source snippet/modules actually changed — same contract as
 * the legacy `patchCard` it replaces.
 */
export function patch(id: string, patcher: (card: Card) => Card): Card | undefined {
  const card = getCardMap()[id];
  if (!card) return undefined;
  const updated: Card = { ...patcher(card), updatedAt: Date.now() };
  if (
    updated.sourceId &&
    (updated.originalSourceSnippet !== card.originalSourceSnippet ||
      !sameSourceModules(updated.sourceModules, card.sourceModules))
  ) {
    invalidateCoverageCache(updated.sourceId);
  }
  commitSingle(updated);
  return updated;
}

/**
 * Resolve a list of ids and apply a per-card patcher. Skips missing ids.
 * Coalesces into a single bulk write + single render.
 */
export function bulkPatch(
  ids: string[],
  patcher: (card: Card) => Card,
): Card[] {
  if (ids.length === 0) return [];
  const now = Date.now();
  const updated: Card[] = [];
  for (const id of ids) {
    const card = getCardMap()[id];
    if (!card) continue;
    updated.push({ ...patcher(card), updatedAt: now });
  }
  if (updated.length > 0) commitBulk(updated);
  return updated;
}

/**
 * Clear source linkage for a set of cards (only those that currently have a
 * sourceId). Used by `onCardLinksCleared` sync. Returns the updated rows.
 */
export function clearLinks(cardIds: string[]): Card[] {
  const updates: Card[] = [];
  const now = Date.now();
  for (const id of cardIds) {
    const c = getCardMap()[id];
    if (!c?.sourceId) continue;
    updates.push({
      ...c,
      sourceId: undefined,
      textAnchor: undefined,
      needsReview: undefined,
      updatedAt: now,
    });
  }
  if (updates.length > 0) commitBulk(updates);
  return updates;
}

/** Clear `needsReview` for one card if currently set. */
export function clearNeedsReview(id: string): Card | undefined {
  const c = getCardMap()[id];
  if (!c) return undefined;
  if (c.needsReview === undefined) return c;
  const updated: Card = { ...c, needsReview: undefined, updatedAt: Date.now() };
  commitSingle(updated);
  return updated;
}

/**
 * Apply a delta of rows fetched from IDB on top of the in-memory map.
 * Newer rows win; missing ids are deleted. Bootstrap-side only — does NOT
 * schedule a persist (the rows came from IDB).
 */
export function applySyncDelta(rows: Card[], deletedIds: string[]): void {
  if (rows.length === 0 && deletedIds.length === 0) return;
  setCardMap((prev) => {
    const next = { ...prev };
    for (const c of rows) next[c.id] = c;
    for (const id of deletedIds) delete next[id];
    return next;
  });
}

/** Replace the entire cardMap atom. Bootstrap / restore only. */
export function replaceAll(map: CardMap): void {
  setCardMap({ ...map });
}

// ─── External-invalidation helper ─────────────────────────────────────────
// Replaces the old CARDS_UPDATED bus + cardMapInvalidator. Callers that
// write to IDB outside the repository (HealthMonitor cleanups, Remap-from-
// backup) must invoke this to bring RAM back in sync.

/** Above this surgical refetch falls back to a full reload (cheaper at scale). */
const SURGICAL_LIMIT = 200;

let _fetchSequence = 0;

/**
 * Re-read the given card ids (surgical) or the whole table (full) from IDB
 * and apply the delta to the in-memory store. Idempotent — concurrent calls
 * are sequenced and only the latest delta is committed.
 */
export async function reloadCardsFromIdb(cardIds?: string[]): Promise<void> {
  const currentSequence = ++_fetchSequence;
  try {
    await persistQueue.cleanup();
    if (currentSequence !== _fetchSequence) return;

    // Surgical path
    if (cardIds && cardIds.length > 0 && cardIds.length <= SURGICAL_LIMIT) {
      const rows = await db.cards.bulkGet(cardIds);
      if (currentSequence !== _fetchSequence) return;
      const fetched = rows.filter((r): r is Card => !!r);
      const fetchedIds = new Set(fetched.map((c) => c.id));
      const deletedIds = cardIds.filter((id) => !fetchedIds.has(id));
      if (fetched.length === 0 && deletedIds.length === 0) return;
      applySyncDelta(fetched, deletedIds);
      return;
    }

    // Full reload
    const loaded = await idbLoadCards();
    if (currentSequence !== _fetchSequence) return;
    const map: CardMap = {};
    for (const c of loaded) map[c.id] = c;
    replaceAll(map);
  } catch (err) {
    logger.warn("[cardRepository] reloadCardsFromIdb failed", err);
  }
}

export const cardRepository = {
  // reads
  get: getCard,
  snapshot,
  // writes
  put,
  bulkPut,
  remove,
  patch,
  bulkPatch,
  clearLinks,
  clearNeedsReview,
  applySyncDelta,
  replaceAll,
  // external invalidation
  reloadFromIdb: reloadCardsFromIdb,
};
