// ─────────────────────────────────────────────────────────────────────────────
// F2 — Card Command Bus + per-cardId Mutex
//
// Every card mutation funnels through `cardCommandBus.dispatch(cmd)`. The
// bus serializes commands per cardId via a Promise-chain mutex, eliminating
// the four-way interleaving (patchCard / clearLinks / reviewConfirmed /
// CARDS_UPDATED sync) that the V5+V10 patches in CardStateProvider were
// trying to paper over. Repository remains the commit layer.
// ─────────────────────────────────────────────────────────────────────────────
import type { Card } from "@/lib/spaced-repetition";
import { cardRepository } from "./cardRepository";

export type CardCommand =
  | { type: "put"; card: Card }
  | { type: "bulkPut"; cards: Card[] }
  | { type: "delete"; id: string }
  | { type: "patch"; id: string; patcher: (card: Card) => Card }
  | { type: "bulkPatch"; ids: string[]; patcher: (card: Card) => Card }
  | { type: "clearLinks"; ids: string[] }
  | { type: "clearNeedsReview"; id: string }
  | { type: "applySyncDelta"; rows: Card[]; deletedIds: string[] }
  | { type: "replaceAll"; map: Record<string, Card> };

// Per-id chain tail. New work appends to it; entry is GC'd when nothing
// newer is queued behind us.
const _chains = new Map<string, Promise<unknown>>();
let _globalChain: Promise<unknown> = Promise.resolve();

function chainTail(id: string): Promise<unknown> {
  return _chains.get(id) ?? Promise.resolve();
}

/**
 * Acquire locks for `ids`, run `work`, release. Empty `ids` ⇒ global lock
 * (drain every chain before running, block all subsequent dispatches until
 * we resolve). Multi-id locks acquire in sorted-id order — deadlock-free.
 */
async function withLocks<T>(ids: string[], work: () => T | Promise<T>): Promise<T> {
  if (ids.length === 0) {
    const wait = Promise.all([_globalChain, ..._chains.values()]).then(() => {});
    let release!: () => void;
    const released = new Promise<void>((res) => { release = res; });
    _globalChain = released;
    try {
      await wait;
      return await work();
    } finally {
      release();
      if (_globalChain === released) _globalChain = Promise.resolve();
    }
  }

  const sorted = Array.from(new Set(ids)).sort();
  const waits = sorted.map((id) => chainTail(id));
  let release!: () => void;
  const released = new Promise<void>((res) => { release = res; });
  for (const id of sorted) _chains.set(id, released);
  try {
    await Promise.all([_globalChain, ...waits]);
    return await work();
  } finally {
    release();
    for (const id of sorted) {
      if (_chains.get(id) === released) _chains.delete(id);
    }
  }
}

function commandIds(cmd: CardCommand): string[] {
  switch (cmd.type) {
    case "put":              return [cmd.card.id];
    case "bulkPut":          return cmd.cards.map((c) => c.id);
    case "delete":           return [cmd.id];
    case "patch":            return [cmd.id];
    case "bulkPatch":        return cmd.ids;
    case "clearLinks":       return cmd.ids;
    case "clearNeedsReview": return [cmd.id];
    case "applySyncDelta":   return [
      ...cmd.rows.map((r) => r.id),
      ...cmd.deletedIds,
    ];
    case "replaceAll":       return []; // global lock
  }
}

function execute(cmd: CardCommand): unknown {
  switch (cmd.type) {
    case "put":              return cardRepository.put(cmd.card);
    case "bulkPut":          return cardRepository.bulkPut(cmd.cards);
    case "delete":           return cardRepository.remove(cmd.id);
    case "patch":            return cardRepository.patch(cmd.id, cmd.patcher);
    case "bulkPatch":        return cardRepository.bulkPatch(cmd.ids, cmd.patcher);
    case "clearLinks":       return cardRepository.clearLinks(cmd.ids);
    case "clearNeedsReview": return cardRepository.clearNeedsReview(cmd.id);
    case "applySyncDelta":   return cardRepository.applySyncDelta(cmd.rows, cmd.deletedIds);
    case "replaceAll":       return cardRepository.replaceAll(cmd.map);
  }
}

/**
 * Dispatch a card mutation through the serialized bus. Per-id ordering is
 * FIFO; multi-id commands are atomic w.r.t. every id they touch.
 */
export function dispatch<T = unknown>(cmd: CardCommand): Promise<T> {
  return withLocks(commandIds(cmd), () => execute(cmd) as T) as Promise<T>;
}

/**
 * Wait for every pending command to drain. Uses a no-op global-lock command
 * as a barrier. Used by tests, quit handlers, full-restore paths.
 */
export async function drain(): Promise<void> {
  await withLocks([], () => {}).catch(() => {});
}

export const cardCommandBus = { dispatch, drain };
