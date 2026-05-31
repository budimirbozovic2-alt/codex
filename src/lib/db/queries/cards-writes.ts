/**
 * PR-E1 — Direct SQLite write helpers for cards.
 *
 * Post-`cardMapStore` removal these are the primary card write seam.
 * They delegate to `persistQueue` (which coalesces + retries via the
 * SQLite adapter) and emit `notifyCardsChanged` so the TanStack bridge
 * invalidates `['cards', ...]` queries. No Zustand mirror, no Ref-Delta.
 *
 * Callers (mutations, heal, import, migrations) DO NOT touch any in-RAM
 * card mirror. TanStack Query is the only in-memory store; this module
 * is the only durable-write seam.
 */
import type { Card } from "@/lib/spaced-repetition";
import {
  persistQueue,
  schedulePersist,
  type CardMap,
} from "@/lib/persist-queue";
import { notifyCardsChanged, listAllCards } from "./cards";

function stamp(card: Card, now: number): Card {
  return card.updatedAt ? card : { ...card, updatedAt: now };
}

/** Schedule a single card write; resolves when SQLite flush completes. */
export async function putCardDirect(card: Card): Promise<Card> {
  const stamped = stamp(card, Date.now());
  schedulePersist({ type: "put", card: stamped });
  await persistQueue.cleanup({ strict: true });
  notifyCardsChanged();
  return stamped;
}

/** Bulk upsert; resolves when SQLite flush completes. */
export async function bulkPutCardsDirect(cards: Card[]): Promise<Card[]> {
  if (cards.length === 0) return [];
  const now = Date.now();
  const stamped = cards.map((c) => stamp(c, now));
  schedulePersist({ type: "bulk", cards: stamped });
  await persistQueue.cleanup({ strict: true });
  notifyCardsChanged();
  return stamped;
}

/** Delete a card by id; resolves when SQLite flush completes. */
export async function deleteCardDirect(id: string): Promise<void> {
  schedulePersist({ type: "delete", id });
  await persistQueue.cleanup({ strict: true });
  notifyCardsChanged();
}

/**
 * Replace the entire cards table with `nextMap`. Used by atomic backup
 * import after `applyImportAtomically` has already written via a SQLite
 * transaction — here we only need to invalidate any prior TanStack cache.
 *
 * Implementation note: the atomic import already wrote the rows in a
 * dedicated SQL transaction. We just emit the change signal and let the
 * bridge invalidate `['cards']`. Accepts `CardMap` for legacy call-site
 * signature parity; the argument is intentionally unused.
 */
export function announceCardsReplaced(_nextMap: CardMap): void {
  void _nextMap; // signature parity; data already in SQLite
  notifyCardsChanged();
}

/**
 * Clear `sourceId`/`textAnchor`/`needsReview` for a set of cards. Replaces
 * the legacy RAM `clearLinks` helper (module deleted in PR-E): skip cards
 * that don't actually have a sourceId, single batched SQLite write, then
 * `notifyCardsChanged` so the TanStack bridge invalidates `['cards']`.
 */
export async function clearCardLinksDirect(cardIds: string[]): Promise<Card[]> {
  if (cardIds.length === 0) return [];
  const { getCardsByIds } = await import("./cards");
  const rows = await getCardsByIds(cardIds);
  const now = Date.now();
  const updates: Card[] = [];
  for (const c of rows) {
    if (!c?.sourceId) continue;
    updates.push({
      ...c,
      sourceId: undefined,
      textAnchor: undefined,
      needsReview: undefined,
      updatedAt: now,
    });
  }
  if (updates.length === 0) return [];
  schedulePersist({ type: "bulk", cards: updates });
  await persistQueue.cleanup({ strict: true });
  notifyCardsChanged();
  return updates;
}

/** Clear `needsReview` for one card. No-op if absent or already cleared. */
export async function clearCardNeedsReviewDirect(id: string): Promise<Card | undefined> {
  const { getCardsByIds } = await import("./cards");
  const [c] = await getCardsByIds([id]);
  if (!c) return undefined;
  if (c.needsReview === undefined) return c;
  const updated: Card = { ...c, needsReview: undefined, updatedAt: Date.now() };
  schedulePersist({ type: "put", card: updated });
  await persistQueue.cleanup({ strict: true });
  notifyCardsChanged();
  return updated;
}

/** Snapshot the entire cards table from SQLite. Replaces RAM `snapshot()`. */
export async function snapshotAllCards(): Promise<Card[]> {
  return listAllCards();
}
