// ─────────────────────────────────────────────────────────────────────────────
// Card map writes — sync RAM commit primitives (post B1 collapse).
//
// Replaces the old `@/lib/repositories/cardRepository` aggregator. This module
// owns the optimistic in-RAM commits against Zustand `cardMapStore`,
// schedules persistence via `persistQueue`, and emits `notifyCardsChanged`
// so the TanStack bridge (`onCardsChanged → invalidateQueries(['cards'])`)
// can react. Async + WriteResult wrappers live inside `useCardMutations`.
//
// Pure module, no React. May be imported from hooks, services, scripts.
// ─────────────────────────────────────────────────────────────────────────────
import type { Card } from "@/lib/spaced-repetition";
import { invalidateCoverageCache } from "@/lib/coverage-analysis";
import { sameSourceModules } from "@/lib/struct-eq";
import {
  schedulePersist,
  persistQueue,
  type CardMap,
} from "@/lib/persist-queue";
import { setCardMap, getCardMap } from "@/store/useCardMapStore";
import {
  listAllCards,
  getCardsByIds,
  notifyCardsChanged,
} from "@/lib/db/queries";
import { logger } from "@/lib/logger";

// ─── Read primitives ──────────────────────────────────────────────────────
export function getCard(id: string): Card | undefined {
  return getCardMap()[id];
}

export function snapshot(): CardMap {
  return getCardMap();
}

// ─── Internal commit helpers ──────────────────────────────────────────────
// PR-B: every commit bumps `_writeEpoch`. `reloadCardsFromDb` captures the
// epoch before it awaits SQLite and bails if a sync write landed during the
// await — otherwise a stale full reload would overwrite the fresh RAM state.
let _writeEpoch = 0;
export function _getWriteEpoch(): number {
  return _writeEpoch;
}

function commitSingle(card: Card): void {
  _writeEpoch++;
  schedulePersist({ type: "put", card });
  setCardMap((prev) => ({ ...prev, [card.id]: card }));
  notifyCardsChanged();
}

function commitBulk(cards: Card[]): void {
  if (cards.length === 0) return;
  _writeEpoch++;
  schedulePersist({ type: "bulk", cards });
  setCardMap((prev) => {
    const next = { ...prev };
    for (const c of cards) next[c.id] = c;
    return next;
  });
  notifyCardsChanged();
}

function commitDelete(id: string): void {
  _writeEpoch++;
  schedulePersist({ type: "delete", id });
  setCardMap((prev) => {
    if (!(id in prev)) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
  notifyCardsChanged();
}

// ─── Sync write primitives ────────────────────────────────────────────────

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
 * if the linked-source snippet/modules actually changed.
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
// Callers that write to IDB outside the write primitives above (HealthMonitor
// cleanups, Remap-from-backup, persist-flush failures) must invoke this to
// bring RAM back in sync with the durable SSOT.

/** Above this surgical refetch falls back to a full reload (cheaper at scale). */
const SURGICAL_LIMIT = 200;

let _fetchSequence = 0;

/**
 * Re-read the given card ids (surgical) or the whole table (full) from the
 * durable SQLite store and apply the delta to the in-memory map. Idempotent
 * — concurrent calls are sequenced and only the latest delta is committed.
 *
 * Backed by `listAllCards` / `getCardsByIds` which are SQLite-primary post A1c.
 */
export async function reloadCardsFromDb(cardIds?: string[]): Promise<void> {
  const currentSequence = ++_fetchSequence;
  try {
    await persistQueue.cleanup();
    if (currentSequence !== _fetchSequence) return;

    // Surgical path — bulk lookup via queries layer (SQLite-primary).
    if (cardIds && cardIds.length > 0 && cardIds.length <= SURGICAL_LIMIT) {
      const rows = await getCardsByIds(cardIds);
      if (currentSequence !== _fetchSequence) return;
      const fetched = rows.filter((r): r is Card => !!r);
      const fetchedIds = new Set(fetched.map((c) => c.id));
      const deletedIds = cardIds.filter((id) => !fetchedIds.has(id));
      if (fetched.length === 0 && deletedIds.length === 0) return;
      applySyncDelta(fetched, deletedIds);
      notifyCardsChanged();
      return;
    }

    // Full reload via the cards queries (SQLite-primary).
    const loaded = await listAllCards();
    if (currentSequence !== _fetchSequence) return;
    const map: CardMap = {};
    for (const c of loaded) map[c.id] = c;
    replaceAll(map);
    notifyCardsChanged();
  } catch (err) {
    logger.warn("[cardMapWrites] reloadCardsFromDb failed", err);
  }
}

// ─── Phase 2b: async-fallback write primitives ────────────────────────────
// `cardMapStore` is no longer hydrated at boot — sync `patch`/`remove`/
// `bulkPatch` miss the RAM map until a TanStack query (`useCardsBy*`) has
// seeded it. These async variants do a SQLite lookup on a RAM miss, seed
// the map, then delegate to the sync commit primitive. Callers in
// `useCardMutations` use these so a "cold" UI path (e.g. grading a card
// reached via deep link before any list rendered) still works.

async function ensureWarm(ids: readonly string[]): Promise<void> {
  const map = getCardMap();
  const missing = ids.filter((id) => !(id in map));
  if (missing.length === 0) return;
  const rows = await getCardsByIds(missing);
  const seed: Card[] = [];
  for (const r of rows) if (r) seed.push(r);
  if (seed.length === 0) return;
  setCardMap((prev) => {
    const next = { ...prev };
    for (const c of seed) next[c.id] = c;
    return next;
  });
}

export async function patchAsync(
  id: string,
  patcher: (card: Card) => Card,
): Promise<Card | undefined> {
  await ensureWarm([id]);
  return patch(id, patcher);
}

export async function removeAsync(id: string): Promise<void> {
  await ensureWarm([id]);
  remove(id);
}

export async function bulkPatchAsync(
  ids: string[],
  patcher: (card: Card) => Card,
): Promise<Card[]> {
  if (ids.length === 0) return [];
  await ensureWarm(ids);
  return bulkPatch(ids, patcher);
}

