/**
 * `useDbError()` — hook nad modul-level dbError snapshot-om iz `db-schema`.
 * Provider je uklonjen: subskripcija na `DB_ERROR_CHANGED` event vodi se
 * modulom, a komponente se vežu kroz `useSyncExternalStore`.
 *
 * Re-exporta `DbErrorProvider` no-op shim postoji samo radi backwards
 * kompatibilnosti — može se ukloniti čim svi pozivaoci skinu wrapper.
 */
import { useSyncExternalStore } from "react";
import { eventBus } from "@/lib/event-bus";
import { EVENT_TYPES } from "@/lib/event-bus-types";
import { getDbErrorState, type DbErrorState } from "@/lib/db-error";

function sameDbError(a: DbErrorState, b: DbErrorState): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.type === b.type && a.message === b.message;
}

let _snap: DbErrorState = getDbErrorState();
const _subscribers = new Set<() => void>();
let _busBound = false;

function ensureBusBound() {
  if (_busBound) return;
  _busBound = true;
  eventBus.subscribe<DbErrorState>(EVENT_TYPES.DB_ERROR_CHANGED, (next) => {
    const incoming = (next ?? null) as DbErrorState;
    if (sameDbError(_snap, incoming)) return;
    _snap = incoming;
    for (const cb of _subscribers) {
      try { cb(); } catch { /* listener errors must not propagate */ }
    }
  });
}

function subscribe(cb: () => void): () => void {
  ensureBusBound();
  _subscribers.add(cb);
  // Resync u slučaju da je error landovao između modul-level snapshot-a i mount-a.
  const current = getDbErrorState();
  if (!sameDbError(_snap, current)) {
    _snap = current;
  }
  return () => { _subscribers.delete(cb); };
}

function getSnapshot(): DbErrorState {
  return _snap;
}

export function useDbError(): DbErrorState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

