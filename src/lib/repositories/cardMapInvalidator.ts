// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — cardMap invalidator.
//
// `cardMapStore` is no longer the SSOT for writes — IDB is. The store is now
// a cache that any module may invalidate by emitting CARDS_UPDATED. This
// module is the *single* place that turns an external invalidation event
// into a RAM refresh, replacing the React-bound dance previously living in
// `useCardSyncEffects`.
//
// Sources of truth for tagging:
//   • "repository"         — our own commit just updated RAM inline. SKIP.
//   • "repository-sync"    — applySyncDelta re-broadcast (self-loop). SKIP.
//   • "repository-replace" — replaceAll bootstrap rehydrated everything. SKIP.
//   • anything else        — external invalidation (HealthMonitor cleanup,
//                            RemapFromBackupDialog, future remote sync, …).
//                            Surgical refetch when `cardIds` is provided and
//                            small; otherwise full reload.
// ─────────────────────────────────────────────────────────────────────────────
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { persistQueue } from "@/lib/persist-queue";
import { logger } from "@/lib/logger";
import type { Card } from "@/lib/spaced-repetition";
import type { CardsUpdatedPayload } from "./cardRepository";

/** Above this surgical refetch falls back to a full reload (cheaper at scale). */
const SURGICAL_LIMIT = 200;

const SELF_SOURCES = new Set([
  "repository",
  "repository-sync",
  "repository-replace",
]);

let _initialized = false;
let _unsub: (() => void) | null = null;
let _fetchSequence = 0;

/**
 * Idempotent. Safe to call from boot (main.tsx) and from HMR re-eval — a
 * second call swaps the subscription cleanly.
 */
export function initCardMapInvalidator(): () => void {
  if (_initialized && _unsub) return _unsub;
  _initialized = true;

  _unsub = eventBus.subscribe<CardsUpdatedPayload>(
    EVENT_TYPES.CARDS_UPDATED,
    (payload) => {
      if (!payload || SELF_SOURCES.has(payload.source)) return;

      const ids = payload.cardIds;
      const currentSequence = ++_fetchSequence;

      // Surgical path — small explicit id set.
      if (ids && ids.length > 0 && ids.length <= SURGICAL_LIMIT) {
        void persistQueue.cleanup()
          .then(() => Promise.all([
            import("@/lib/db"),
            import("./cardRepository"),
          ]))
          .then(async ([{ db }, { applySyncDelta }]) => {
            if (currentSequence !== _fetchSequence) return;
            const rows = await db.cards.bulkGet(ids);
            if (currentSequence !== _fetchSequence) return;
            const fetched = rows.filter((r): r is Card => !!r);
            const fetchedIds = new Set(fetched.map((c) => c.id));
            const deletedIds = (payload.deletedIds ?? []).concat(
              ids.filter((id) => !fetchedIds.has(id)),
            );
            if (fetched.length === 0 && deletedIds.length === 0) return;
            applySyncDelta(fetched, deletedIds);
          })
          .catch((e) => logger.warn("[cardMapInvalidator] surgical refetch failed", e));
        return;
      }

      // Fallback — full reload (no ids, or oversized id set).
      void persistQueue.cleanup()
        .then(() => Promise.all([
          import("@/lib/db-queries"),
          import("./cardRepository"),
        ]))
        .then(async ([{ idbLoadCards }, { replaceAll }]) => {
          if (currentSequence !== _fetchSequence) return;
          const loaded = await idbLoadCards();
          if (currentSequence !== _fetchSequence) return;
          const map: Record<string, Card> = {};
          for (const c of loaded) map[c.id] = c;
          replaceAll(map);
        })
        .catch((e) => logger.warn("[cardMapInvalidator] full reload failed", e));
    },
  );

  return _unsub;
}

/** Test helper — tears down the singleton subscription. */
export function __teardownCardMapInvalidatorForTests(): void {
  if (_unsub) _unsub();
  _unsub = null;
  _initialized = false;
  _fetchSequence = 0;
}
