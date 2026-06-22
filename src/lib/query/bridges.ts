/**
 * Module-level bridge — pumps invalidations into TanStack.
 * Pinned to globalThis via Symbol to survive Vite HMR.
 *
 * S1/S6 refactor: all domain change subscriptions now route through the
 * unified event bus (`onDomainChanged`). The BRIDGES_KEY globalThis Symbol
 * is retained for HMR idempotency — each HMR cycle re-evaluates this module
 * and would re-register listeners without the guard.
 *
 * Bulk write rules (see `runBulkWriteSession` in all-caches-coordinator):
 * 1. `commitCardsWriteFromDb` derived flush invalidates all except
 *    `cards.all` + `count.all` — sufficient after bulk coordinator commit.
 * 2. Bulk flows must NOT call `notifyCardsChanged({ kind: "all" })` or
 *    `invalidateQueries({ queryKey: ["cards"] })` prefix invalidation.
 * 3. Scoped notify (`category`, `subcategory`, `chapter`) is for single-card
 *    paths only — not after a `commitCardsWriteFromDb` in the same session.
 */
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  onDomainChanged,
  type DomainChangedPayload,
} from "@/lib/event-bus";
import { reviewLogRepository, settingsRepository } from "@/lib/repositories";
import { DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { REVIEW_LOG_BOOT_DAYS } from "@/lib/query/review-settings-cache-coordinator";
import { metrics } from "@/lib/metrics";
import type { CardsChangedScope } from "@/lib/event-bus-types";

const BRIDGES_KEY = Symbol.for("codex.querybridges");

interface CodexGlobalBridges {
  [BRIDGES_KEY]?: {
    installed: boolean;
    unsubs: Array<() => void>;
  };
}
const slots = globalThis as typeof globalThis & CodexGlobalBridges;

if (!slots[BRIDGES_KEY]) {
  slots[BRIDGES_KEY] = {
    installed: false,
    unsubs: []
  };
}
const state = slots[BRIDGES_KEY]!;

const CARDS_TRAILING_MS = 16;
const CARDS_MAX_WAIT_MS = 250;

let _trailingTimer: ReturnType<typeof setTimeout> | null = null;
let _maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingPrefix = false;
let _pendingDerived = false;
const _pendingKeys = new Set<string>();

let _cycleId: string | null = null;
let _cycleOpenedAt = 0;
let _cycleEmits = 0;

function newCycleId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Scopes that map to concrete query keys (not prefix-wide all/derived). */
type CardsKeyedScope = Exclude<
  CardsChangedScope,
  { kind: "all" } | { kind: "derived" }
>;

function keysForScope(
  scope: CardsKeyedScope
): readonly (readonly string[])[] {
  switch (scope.kind) {
    case "category": {
      const { categoryId } = scope;
      return [
        queryKeys.cards.all(),
        queryKeys.cards.byCategory(categoryId),
        // PR-H7 Fix: Koristimo centralne prefikse
        queryKeys.cards._subcatRoot(categoryId),
        queryKeys.cards._chapRoot(categoryId),
        queryKeys.cards._typeRoot(categoryId),
        queryKeys.cards.countByCategory(categoryId),
        queryKeys.cards.countAll(),
      ];
    }
    case "subcategory": {
      const { categoryId, subcategoryId } = scope;
      return [
        queryKeys.cards.all(),
        queryKeys.cards.byCategory(categoryId),
        queryKeys.cards.bySubcategory(categoryId, subcategoryId),
        queryKeys.cards.countByCategory(categoryId),
        queryKeys.cards.countAll(),
      ];
    }
    case "chapter": {
      const { categoryId, chapterId } = scope;
      return [
        queryKeys.cards.all(),
        queryKeys.cards.byCategory(categoryId),
        queryKeys.cards.byChapter(categoryId, chapterId),
        queryKeys.cards.countByCategory(categoryId),
        queryKeys.cards.countAll(),
      ];
    }
    case "source":
      return [
        queryKeys.cards.all(), 
        queryKeys.cards.bySource(scope.sourceId),
        queryKeys.cards.countAll(),
      ];
  }
}

/** Invalidate scoped card queries — excludes authoritative seed keys (all + countAll). */
function isDerivedCardsQueryKey(key: readonly unknown[]): boolean {
  if (!Array.isArray(key) || key[0] !== "cards") return false;
  if (key.length === 2 && key[1] === "all") return false;
  if (key.length === 3 && key[1] === "count" && key[2] === "all") return false;
  return true;
}

function flushCardsInvalidate(qc: QueryClient): void {
  if (_trailingTimer !== null) { 
    clearTimeout(_trailingTimer); 
    _trailingTimer = null; 
  }
  if (_maxWaitTimer !== null) { 
    clearTimeout(_maxWaitTimer); 
    _maxWaitTimer = null; 
  }

  const cycleId = _cycleId;
  const duration = cycleId !== null ? Date.now() - _cycleOpenedAt : 0;
  const emits = _cycleEmits;

  if (_pendingPrefix) {
    _pendingPrefix = false;
    _pendingDerived = false;
    _pendingKeys.clear();
    metrics.inc("bridges.cards.flush.prefix");
    metrics.event("bridges.cards.cycle.flush", { 
      cycleId, 
      kind: "prefix", 
      duration, 
      emits 
    });
    _cycleId = null; 
    _cycleEmits = 0;
    void qc.invalidateQueries({ queryKey: ["cards"] });
    return;
  }

  if (_pendingDerived) {
    _pendingDerived = false;
    _pendingKeys.clear();
    metrics.inc("bridges.cards.flush.derived");
    metrics.event("bridges.cards.cycle.flush", {
      cycleId,
      kind: "derived",
      duration,
      emits,
    });
    _cycleId = null;
    _cycleEmits = 0;
    void qc.invalidateQueries({
      queryKey: queryKeys.cards.root,
      predicate: (query) => isDerivedCardsQueryKey(query.queryKey),
    });
    return;
  }

  if (_pendingKeys.size === 0) {
    _cycleId = null; 
    _cycleEmits = 0;
    return;
  }
  const keys = Array.from(_pendingKeys);
  _pendingKeys.clear();
  metrics.inc("bridges.cards.flush.scoped");
  metrics.observe("bridges.cards.flush.batchSize", keys.length);
  metrics.event("bridges.cards.cycle.flush", { 
    cycleId, 
    kind: "scoped", 
    duration, 
    emits, 
    batchSize: keys.length 
  });
  _cycleId = null; 
  _cycleEmits = 0;
  for (const serialized of keys) {
    const queryKey = JSON.parse(serialized) as readonly unknown[];
    void qc.invalidateQueries({ queryKey });
  }
}

function scheduleCardsInvalidate(
  qc: QueryClient, 
  scope: CardsChangedScope
): void {
  if (_cycleId === null) {
    _cycleId = newCycleId();
    _cycleOpenedAt = Date.now();
    _cycleEmits = 0;
    metrics.event("bridges.cards.cycle.open", { 
      cycleId: _cycleId, 
      kind: scope.kind 
    });
  }
  _cycleEmits += 1;

  metrics.inc(`bridges.cards.schedule.${scope.kind}`);
  if (scope.kind === "all") {
    _pendingPrefix = true;
    _pendingDerived = false;
    _pendingKeys.clear();
  } else if (scope.kind === "derived") {
    _pendingDerived = true;
  } else if (!_pendingPrefix) {
    for (const key of keysForScope(scope)) {
      _pendingKeys.add(JSON.stringify(key));
    }
  } else {
    metrics.inc("bridges.cards.schedule.subsumed");
    metrics.event("bridges.cards.cycle.subsumed", { 
      cycleId: _cycleId, 
      scope: scope.kind 
    });
  }

  if (_trailingTimer !== null) clearTimeout(_trailingTimer);
  _trailingTimer = setTimeout(
    () => flushCardsInvalidate(qc), 
    CARDS_TRAILING_MS
  );

  if (_maxWaitTimer === null) {
    _maxWaitTimer = setTimeout(
      () => flushCardsInvalidate(qc), 
      CARDS_MAX_WAIT_MS
    );
  }
}

function _flushCardsInvalidateForTest(): void {
  if (_trailingTimer !== null) { 
    clearTimeout(_trailingTimer); 
    _trailingTimer = null; 
  }
  if (_maxWaitTimer !== null) { 
    clearTimeout(_maxWaitTimer); 
    _maxWaitTimer = null; 
  }
  _pendingPrefix = false;
  _pendingDerived = false;
  _pendingKeys.clear();
  _cycleId = null;
  _cycleEmits = 0;
}

export function installQueryBridges(qc: QueryClient): void {
  if (state.installed) return;
  state.installed = true;

  state.unsubs.push(onDomainChanged((payload: DomainChangedPayload) => {
    switch (payload.domain) {
      case "sources":
        metrics.inc("bridges.sources.invalidate");
        void qc.invalidateQueries({ queryKey: ["sources"] });
        break;
      case "planner":
        metrics.inc(`bridges.planner.${payload.kind}`);
        switch (payload.kind) {
          case "config":
            void qc.invalidateQueries({
              queryKey: queryKeys.planner.root,
              predicate: (query) => {
                const k = query.queryKey;
                return k[0] === "planner" && k[1] !== "config";
              },
            });
            break;
          case "discipline":
            void qc.invalidateQueries({
              queryKey: queryKeys.planner.root,
              predicate: (query) => {
                const k = query.queryKey;
                return (
                  k[0] === "planner"
                  && k[1] === "discipline"
                  && k[2] !== "log"
                );
              },
            });
            break;
          case "dailyMapped":
          case "lastRedistribute":
            break;
        }
        break;
      case "cards":
        scheduleCardsInvalidate(qc, payload.scope);
        break;
      case "categories":
        metrics.inc("bridges.categories.invalidate");
        void qc.invalidateQueries({ queryKey: queryKeys.categories.root });
        break;
      case "review":
        metrics.inc(`bridges.review.${payload.kind}`);
        if (payload.kind === "replace") {
          void reviewLogRepository
            .loadRecent(REVIEW_LOG_BOOT_DAYS)
            .then((log) => {
              qc.setQueryData(
                queryKeys.review.logRecent(REVIEW_LOG_BOOT_DAYS),
                log,
              );
            });
        }
        break;
      case "settings":
        metrics.inc(`bridges.settings.${payload.kind}`);
        if (payload.kind === "sr") {
          void settingsRepository
            .load("srSettings", DEFAULT_SR_SETTINGS)
            .then((settings) => {
              qc.setQueryData(queryKeys.settings.sr(), settings);
            });
        }
        break;
      case "mindmaps":
        metrics.inc("bridges.mindMaps.invalidate");
        void qc.invalidateQueries({ queryKey: ["mindMaps"] });
        break;
      case "mnemonics":
        metrics.inc("bridges.mnemonics.invalidate");
        void qc.invalidateQueries({ queryKey: ["mnemonics"] });
        break;
      case "zettelkasten":
        metrics.inc("bridges.knowledgeBase.invalidate");
        void qc.invalidateQueries({ queryKey: ["knowledgeBase"] });
        break;
    }
  }));
}

export function _resetBridgesForTest(): void {
  while (state.unsubs.length > 0) {
    const off = state.unsubs.pop();
    try { off?.(); } catch { /* ignore */ }
  }
  state.installed = false;
  _flushCardsInvalidateForTest();
}
