/**
 * Module-level bridge — pumps invalidations into TanStack.
 * Pinned to globalThis via Symbol to survive Vite HMR.
 *
 * S1/S6 refactor: all domain change subscriptions now route through the
 * unified event bus (`onDomainChanged`). The BRIDGES_KEY globalThis Symbol
 * is retained for HMR idempotency — each HMR cycle re-evaluates this module
 * and would re-register listeners without the guard.
 */
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  onDomainChanged,
  type DomainChangedPayload,
} from "@/lib/event-bus";
import {
  loadPlanner,
  loadDisciplineLog,
} from "@/domains/planner";
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
const _pendingKeys = new Set<string>();

let _cycleId: string | null = null;
let _cycleOpenedAt = 0;
let _cycleEmits = 0;

function newCycleId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function keysForScope(
  scope: CardsChangedScope
): readonly (readonly string[])[] {
  switch (scope.kind) {
    case "all":
      return [];
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
      ];
    }
    case "subcategory": {
      const { categoryId, subcategoryId } = scope;
      return [
        queryKeys.cards.all(),
        queryKeys.cards.byCategory(categoryId),
        queryKeys.cards.bySubcategory(categoryId, subcategoryId),
        queryKeys.cards.countByCategory(categoryId),
      ];
    }
    case "chapter": {
      const { categoryId, chapterId } = scope;
      return [
        queryKeys.cards.all(),
        queryKeys.cards.byCategory(categoryId),
        queryKeys.cards.byChapter(categoryId, chapterId),
        queryKeys.cards.countByCategory(categoryId),
      ];
    }
    case "source":
      return [
        queryKeys.cards.all(), 
        queryKeys.cards.bySource(scope.sourceId)
      ];
  }
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
    _pendingKeys.clear();
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

export function _flushCardsInvalidateForTest(): void {
  if (_trailingTimer !== null) { 
    clearTimeout(_trailingTimer); 
    _trailingTimer = null; 
  }
  if (_maxWaitTimer !== null) { 
    clearTimeout(_maxWaitTimer); 
    _maxWaitTimer = null; 
  }
  _pendingPrefix = false;
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
            qc.setQueryData(queryKeys.planner.config(), loadPlanner());
            break;
          case "discipline":
            qc.setQueryData(
              queryKeys.planner.disciplineLog(), 
              loadDisciplineLog()
            );
            break;
          case "dailyMapped":
          case "lastRedistribute":
            break;
        }
        break;
      case "cards":
        scheduleCardsInvalidate(qc, payload.scope);
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
