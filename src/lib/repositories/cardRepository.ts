// ─────────────────────────────────────────────────────────────────────────────
// M1+A1 — Card Repository Facade
//
// Single source of truth for **card mutations**. Owns the contract between
// the in-memory cardMap (Zustand store + ref facade) and the IndexedDB
// persist queue. Higher layers (hooks, providers, services) call repository
// methods instead of poking at `schedulePersist`, `cardMapRef.current`, and
// `setCardMap` directly — this severs the tight coupling identified in the
// architecture audit (A1) and lets us evolve persistence without touching UI.
// ─────────────────────────────────────────────────────────────────────────────
import type { Card } from "@/lib/spaced-repetition";
import { invalidateCoverageCache } from "@/lib/coverage-analysis";
import { sameSourceModules } from "@/lib/struct-eq";
import {
  bumpMapVersion,
  schedulePersist,
  type CardMap,
} from "@/lib/persist-queue";
import {
  cardMapRefFacade,
  setCardMap,
  getCardMap,
} from "@/store/useCardMapStore";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";

// ─── Phase 3 — invalidation broadcast ──────────────────────────────────────
// Every repository write fans out a CARDS_UPDATED event tagged with the
// commit source. The module-level `cardMapInvalidator` filters our own
// "repository" / "repository-sync" emissions back out so we don't double-
// apply (RAM is already up-to-date inline). External emitters (HealthMonitor,
// RemapFromBackupDialog, future remote sync) keep using their own source
// strings and the invalidator does the bulkGet → applySyncDelta dance.
export type CardsUpdatedSource =
  | "repository"
  | "repository-sync"
  | "repository-replace"
  | string; // external (orphan-cleanup, delete-cards, remap-from-backup, …)

export interface CardsUpdatedPayload {
  source: CardsUpdatedSource;
  cardIds?: string[];
  deletedIds?: string[];
}

function emitCardsUpdated(payload: CardsUpdatedPayload): void {
  try { eventBus.emit(EVENT_TYPES.CARDS_UPDATED, payload); }
  catch { /* bus failures must not break a commit */ }
}

// ─── Read primitives ──────────────────────────────────────────────────────
export function getCard(id: string): Card | undefined {
  return cardMapRefFacade.current[id];
}

export function snapshot(): CardMap {
  return getCardMap();
}

// ─── Internal helpers ─────────────────────────────────────────────────────
// NOTE (C4 follow-up): `cardMapRefFacade.current` and the Zustand store atom
// are the SAME reference. In-place mutation of `current` therefore mutates
// the very `prev` object that `setCardMap`'s updater is about to inspect,
// which defeats any "skip-if-noop" guard (notably in commitDelete, where
// `prev[id]` is already gone, the guard returns `prev`, no notify fires,
// and the UI never re-renders the deletion). Single source of truth: write
// via `setCardMap`; the ref getter reads the live atom right after.
function commitSingle(card: Card): void {
  schedulePersist({ type: "put", card });
  setCardMap((prev) => ({ ...prev, [card.id]: card }));
  bumpMapVersion();
  emitCardsUpdated({ source: "repository", cardIds: [card.id] });
}

function commitBulk(cards: Card[]): void {
  if (cards.length === 0) return;
  schedulePersist({ type: "bulk", cards });
  setCardMap((prev) => {
    const next = { ...prev };
    for (const c of cards) next[c.id] = c;
    return next;
  });
  bumpMapVersion();
  emitCardsUpdated({
    source: "repository",
    cardIds: cards.map((c) => c.id),
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
  bumpMapVersion();
  emitCardsUpdated({ source: "repository", deletedIds: [id] });
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
  const card = cardMapRefFacade.current[id];
  if (card?.sourceId) invalidateCoverageCache(card.sourceId);
  commitDelete(id);
}

/**
 * Apply a structural patch to a single card. Invalidates coverage cache only
 * if the linked-source snippet/modules actually changed — same contract as
 * the legacy `patchCard` it replaces.
 */
export function patch(id: string, patcher: (card: Card) => Card): Card | undefined {
  const card = cardMapRefFacade.current[id];
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
    const card = cardMapRefFacade.current[id];
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
    const c = cardMapRefFacade.current[id];
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
  const c = cardMapRefFacade.current[id];
  if (!c) return undefined;
  if (c.needsReview === undefined) return c;
  const updated: Card = { ...c, needsReview: undefined, updatedAt: Date.now() };
  commitSingle(updated);
  return updated;
}

/**
 * Apply a remote sync delta from the CARDS_UPDATED bus event. Newer rows
 * win over the in-memory copy; missing ids are deleted.
 */
export function applySyncDelta(rows: Card[], deletedIds: string[]): void {
  if (rows.length === 0 && deletedIds.length === 0) return;
  setCardMap((prev) => {
    const next = { ...prev };
    for (const c of rows) next[c.id] = c;
    for (const id of deletedIds) delete next[id];
    return next;
  });
  bumpMapVersion();
  // Tagged "repository-sync" so the invalidator can identify (and skip) its
  // own re-entry — applySyncDelta is invoked BY the invalidator after a
  // bulkGet, and re-broadcasting "repository" would feed back into itself.
  emitCardsUpdated({
    source: "repository-sync",
    cardIds: rows.map((c) => c.id),
    deletedIds,
  });
}

/** Replace the entire cardMap atom. Bootstrap / restore only. */
export function replaceAll(map: CardMap): void {
  setCardMap({ ...map });
  bumpMapVersion();
  emitCardsUpdated({ source: "repository-replace" });
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
};
