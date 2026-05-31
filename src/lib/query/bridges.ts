/**
 * Modul-level bridge — postojeći SSOT eventovi pumpaju invalidaciju u
 * TanStack QueryClient. Bez ovog mosta TanStack ne bi znao za promjene
 * koje pišu Ref-Delta mutacije izvan njegovog `useMutation`.
 *
 * Pozvati JEDNOM (iz `client.ts`). Idempotentno — drugi poziv je no-op.
 */
import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { onSourcesChanged } from "@/lib/sources-storage";
import { onPlannerChanged, type PlannerChangeKind, loadPlanner, loadDisciplineLog } from "@/domains/planner";
import { onCardsChanged, onKnowledgeBaseChanged, type CardsScope } from "@/lib/db/queries";
import { onMindMapsChanged } from "@/lib/mindmap-storage";
import { subscribeMnemonics } from "@/features/mnemonic/mnemonic-storage/cards-repo";
import { metrics } from "@/lib/metrics";

let _installed = false;
const _unsubs: Array<() => void> = [];


// ── Cards invalidation debouncer (per-scope + max-wait) ──────────────────
//
// `notifyCardsChanged(scope?)` fires once per write commit. A burst (bulk
// import, FSRS grade-many, restore, taxonomy migration) can stack hundreds
// of notifications in a single tick.
//
// Strategy:
//   • Each scoped notification expands into a SET of partial query keys
//     (serialized as JSON strings) covering only the slices it affects.
//   • An unscoped (`kind:"all"`) notification escalates to a single
//     `["cards"]` prefix invalidation — covers every consumer.
//   • A trailing debounce (16ms ≈ 1 frame) collapses bursts in the same tick.
//   • A max-wait cap (250ms) forces a flush during long, continuous bursts
//     where the trailing window keeps resetting (e.g. multi-second imports
//     that emit every few ms).
const CARDS_TRAILING_MS = 16;
const CARDS_MAX_WAIT_MS = 250;

let _trailingTimer: ReturnType<typeof setTimeout> | null = null;
let _maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingPrefix = false;
const _pendingKeys = new Set<string>(); // JSON-serialized query keys

// ── Correlation tracing ─────────────────────────────────────────────
// Each invalidation "cycle" (first schedule → flush) gets a stable short
// id so that schedule/subsumed/flush events emitted across multiple ticks
// can be stitched together post-mortem from the metrics event ring.
//
// Cycle lifecycle:
//   • first schedule in idle state → mint id, record opened-at
//   • subsequent schedules in the same window → reuse id, bump emit count
//   • flush → emit close event with id, duration, emit count, key set size
let _cycleId: string | null = null;
let _cycleOpenedAt = 0;
let _cycleEmits = 0;

function newCycleId(): string {
  // 6-char base36 is enough for log readability and uniqueness within a
  // single session (cycles are rare; collisions are inconsequential).
  return Math.random().toString(36).slice(2, 8);
}

function keysForScope(scope: CardsScope): readonly (readonly string[])[] {
  switch (scope.kind) {
    case "all":
      return []; // signals prefix escalation; caller handles flag
    case "category": {
      const { categoryId } = scope;
      return [
        queryKeys.cards.all(),
        queryKeys.cards.byCategory(categoryId),
        ["cards", "subcat", categoryId],
        ["cards", "chap", categoryId],
        ["cards", "type", categoryId],
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
      return [queryKeys.cards.all(), queryKeys.cards.bySource(scope.sourceId)];
  }
}

function flushCardsInvalidate(qc: QueryClient): void {
  if (_trailingTimer !== null) { clearTimeout(_trailingTimer); _trailingTimer = null; }
  if (_maxWaitTimer !== null) { clearTimeout(_maxWaitTimer); _maxWaitTimer = null; }

  const cycleId = _cycleId;
  const duration = cycleId !== null ? Date.now() - _cycleOpenedAt : 0;
  const emits = _cycleEmits;

  if (_pendingPrefix) {
    _pendingPrefix = false;
    _pendingKeys.clear();
    metrics.inc("bridges.cards.flush.prefix");
    metrics.event("bridges.cards.cycle.flush", { cycleId, kind: "prefix", duration, emits });
    _cycleId = null; _cycleEmits = 0;
    void qc.invalidateQueries({ queryKey: ["cards"] });
    return;
  }

  if (_pendingKeys.size === 0) {
    _cycleId = null; _cycleEmits = 0;
    return;
  }
  const keys = Array.from(_pendingKeys);
  _pendingKeys.clear();
  metrics.inc("bridges.cards.flush.scoped");
  metrics.observe("bridges.cards.flush.batchSize", keys.length);
  metrics.event("bridges.cards.cycle.flush", { cycleId, kind: "scoped", duration, emits, batchSize: keys.length });
  _cycleId = null; _cycleEmits = 0;
  for (const serialized of keys) {
    const queryKey = JSON.parse(serialized) as readonly unknown[];
    void qc.invalidateQueries({ queryKey });
  }
}

function scheduleCardsInvalidate(qc: QueryClient, scope: CardsScope): void {
  // Open a new cycle on the first schedule of an idle window.
  if (_cycleId === null) {
    _cycleId = newCycleId();
    _cycleOpenedAt = Date.now();
    _cycleEmits = 0;
    metrics.event("bridges.cards.cycle.open", { cycleId: _cycleId, kind: scope.kind });
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
    // Scoped event arrived while a prefix flush is already pending — it
    // would be subsumed anyway. Track so we can spot suspicious churn.
    metrics.inc("bridges.cards.schedule.subsumed");
    metrics.event("bridges.cards.cycle.subsumed", { cycleId: _cycleId, scope: scope.kind });
  }

  // Reset trailing window on every emit.
  if (_trailingTimer !== null) clearTimeout(_trailingTimer);
  _trailingTimer = setTimeout(() => flushCardsInvalidate(qc), CARDS_TRAILING_MS);

  // Arm max-wait only on the first emit of a window.
  if (_maxWaitTimer === null) {
    _maxWaitTimer = setTimeout(() => flushCardsInvalidate(qc), CARDS_MAX_WAIT_MS);
  }
}

/** Test seam — drain the pending invalidation immediately. */
export function _flushCardsInvalidateForTest(): void {
  if (_trailingTimer !== null) { clearTimeout(_trailingTimer); _trailingTimer = null; }
  if (_maxWaitTimer !== null) { clearTimeout(_maxWaitTimer); _maxWaitTimer = null; }
  _pendingPrefix = false;
  _pendingKeys.clear();
  _cycleId = null;
  _cycleEmits = 0;
}

export function installQueryBridges(qc: QueryClient): void {
  if (_installed) return;
  _installed = true;


  // ── Sources ─────────────────────────────────────────────
  _unsubs.push(onSourcesChanged(() => {
    metrics.inc("bridges.sources.invalidate");
    void qc.invalidateQueries({ queryKey: ["sources"] });
  }));

  // ── Planner ─────────────────────────────────────────────
  // D.4: push cache snapshots straight into TanStack via setQueryData so
  // `useQuery` data matches the sync `loadPlanner()`/`loadDisciplineLog()`
  // getters in the same tick (no invalidate-then-refetch divergence window).
  // Derived calcs still re-run because their queryKey prefix is the same
  // mutation source and TanStack notifies subscribers on setQueryData.
  _unsubs.push(onPlannerChanged((kind: PlannerChangeKind) => {
    metrics.inc(`bridges.planner.${kind}`);
    switch (kind) {
      case "config":
        qc.setQueryData(queryKeys.planner.config(), loadPlanner());
        break;
      case "discipline":
        qc.setQueryData(queryKeys.planner.disciplineLog(), loadDisciplineLog());
        void qc.invalidateQueries({ queryKey: ["planner", "discipline"] });
        break;
      case "dailyMapped":
      case "lastRedistribute":
        break;
    }
  }));

  // ── Cards (P1.5) ────────────────────────────────────────
  // Fired by `notifyCardsChanged` after a `cardRepository` write commits
  // to RAM + persist-queue. Debounced ~16ms so a burst of Zustand commits
  // (bulk import, FSRS grade-many, restore) collapses into one invalidation
  // → one refetch per scoped query → one re-render per consumer.
  _unsubs.push(onCardsChanged((scope) => {
    scheduleCardsInvalidate(qc, scope);
  }));

  // ── Mind maps ───────────────────────────────────────────
  // SSOT façade (`mindmap-storage`) emituje nakon save/delete/invalidate.
  _unsubs.push(onMindMapsChanged(() => {
    metrics.inc("bridges.mindMaps.invalidate");
    void qc.invalidateQueries({ queryKey: ["mindMaps"] });
  }));

  // ── Mnemonics (cards + major-system + test-log) ─────────
  // `subscribeMnemonics` se fire-uje iz cards-repo nakon bulkPut/delete.
  // Major-system i test-log dijele istu invalidacionu zonu (sve čita
  // mnemonic feature, scopovi su pod istim prefixom).
  _unsubs.push(subscribeMnemonics(() => {
    metrics.inc("bridges.mnemonics.invalidate");
    void qc.invalidateQueries({ queryKey: ["mnemonics"] });
  }));

  // ── Knowledge base (Zettel) ─────────────────────────────
  // notifyKnowledgeBaseChanged se fire-uje iz queries/knowledge-base.ts
  // nakon put/bulkPut/delete; bulkCreate/ensureIndex prolaze kroz bulkPut.
  _unsubs.push(onKnowledgeBaseChanged(() => {
    metrics.inc("bridges.knowledgeBase.invalidate");
    void qc.invalidateQueries({ queryKey: ["knowledgeBase"] });
  }));


  // NOTE: drafts + settings bridges removed (S8). Neither domain has any
  // TanStack `useQuery` consumer — autosave reads through Zustand mirrors
  // and settings through their own listener seams. Re-add when/if a
  // useQuery hook is introduced for these keys.
}

/** Test-only helper — resetuje internal flag tako da test može re-instalirati bridge sa svježim mockom. */
export function _resetBridgesForTest(): void {
  while (_unsubs.length > 0) {
    const off = _unsubs.pop();
    try { off?.(); } catch { /* ignore */ }
  }
  _installed = false;
  _flushCardsInvalidateForTest();
}

// Wave-3 fix: HMR dispose. Without this, Vite re-evaluates modules but the
// module-level `_installed` flag remains set in the new module instance only
// because the old module was disposed — except the OLD subscriptions stay
// alive against a dead QueryClient. The result: source/cards/mindmap writes
// silently stop invalidating, and `useSourceMutations` papered over this
// with onSuccess safety-net invalidations. Dispose here makes the bridge
// re-install cleanly on every HMR cycle.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _resetBridgesForTest();
  });
}


