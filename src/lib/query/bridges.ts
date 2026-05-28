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
import { onPlannerChanged, type PlannerChangeKind } from "@/lib/planner";
import { onCardsChanged, onKnowledgeBaseChanged } from "@/lib/db/queries";
import { onMindMapsChanged } from "@/lib/mindmap-storage";
import { subscribeMnemonics } from "@/features/mnemonic/mnemonic-storage/cards-repo";

let _installed = false;
const _unsubs: Array<() => void> = [];


// ── Cards invalidation debouncer ────────────────────────────────────────
// `notifyCardsChanged` fires once per Zustand commit. A burst (bulk import,
// FSRS grade-many, restore, taxonomy migration) can stack hundreds of
// notifications in a single tick. Each one calling `invalidateQueries`
// triggers a refetch on every active `['cards', …]` consumer — that's the
// re-render storm.
//
// We coalesce into a single trailing invalidation per ~16ms window
// (≈1 animation frame). All scoped cards queries share the `["cards"]`
// prefix, so one invalidation handles every consumer.
const CARDS_DEBOUNCE_MS = 16;
let _cardsTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleCardsInvalidate(qc: QueryClient): void {
  if (_cardsTimer !== null) return;
  _cardsTimer = setTimeout(() => {
    _cardsTimer = null;
    void qc.invalidateQueries({ queryKey: ["cards"] });
  }, CARDS_DEBOUNCE_MS);
}

/** Test seam — drain the pending invalidation immediately. */
export function _flushCardsInvalidateForTest(): void {
  if (_cardsTimer === null) return;
  clearTimeout(_cardsTimer);
  _cardsTimer = null;
}

export function installQueryBridges(qc: QueryClient): void {
  if (_installed) return;
  _installed = true;


  // ── Sources ─────────────────────────────────────────────
  onSourcesChanged(() => {
    void qc.invalidateQueries({ queryKey: ["sources"] });
  });

  // ── Planner ─────────────────────────────────────────────
  onPlannerChanged((kind: PlannerChangeKind) => {
    switch (kind) {
      case "config":
        // Config change invalidira derived calcove (plans, burnup, suggestion,
        // projection, status) jer sve uzimaju bufferPercent/finalGoalDate.
        // Optimistic seed iz `usePlannerMutations.saveConfig` ostaje validan —
        // queryFn vraća isti `plannerCache.get()`.
        void qc.invalidateQueries({ queryKey: queryKeys.planner.root });
        break;
      case "discipline":
        // Scoped: discipline log/trend/phasePct dijele prefix.
        void qc.invalidateQueries({ queryKey: ["planner", "discipline"] });
        break;
      case "dailyMapped":
      case "lastRedistribute":
        // No TanStack query reads these — counter ide kroz useDeferredCompute
        // u useDashboardData. Bridge bi nepotrebno refetchao plans/burnup/etc.
        break;
    }
  });

  // ── Cards (P1.5) ────────────────────────────────────────
  // Fired by `notifyCardsChanged` after a `cardRepository` write commits
  // to RAM + persist-queue. Debounced ~16ms so a burst of Zustand commits
  // (bulk import, FSRS grade-many, restore) collapses into one invalidation
  // → one refetch per scoped query → one re-render per consumer.
  onCardsChanged(() => {
    scheduleCardsInvalidate(qc);
  });


  // ── Mind maps ───────────────────────────────────────────
  // SSOT façade (`mindmap-storage`) emituje nakon save/delete/invalidate.
  onMindMapsChanged(() => {
    void qc.invalidateQueries({ queryKey: ["mindMaps"] });
  });

  // ── Mnemonics (cards + major-system + test-log) ─────────
  // `subscribeMnemonics` se fire-uje iz cards-repo nakon bulkPut/delete.
  // Major-system i test-log dijele istu invalidacionu zonu (sve čita
  // mnemonic feature, scopovi su pod istim prefixom).
  subscribeMnemonics(() => {
    void qc.invalidateQueries({ queryKey: ["mnemonics"] });
  });

  // ── Knowledge base (Zettel) ─────────────────────────────
  // notifyKnowledgeBaseChanged se fire-uje iz queries/knowledge-base.ts
  // nakon put/bulkPut/delete; bulkCreate/ensureIndex prolaze kroz bulkPut.
  onKnowledgeBaseChanged(() => {
    void qc.invalidateQueries({ queryKey: ["knowledgeBase"] });
  });

  // NOTE: drafts + settings bridges removed (S8). Neither domain has any
  // TanStack `useQuery` consumer — autosave reads through Zustand mirrors
  // and settings through their own listener seams. Re-add when/if a
  // useQuery hook is introduced for these keys.
}

/** Test-only helper — resetuje internal flag tako da test može re-instalirati bridge sa svježim mockom. */
export function _resetBridgesForTest(): void {
  _installed = false;
  _flushCardsInvalidateForTest();
}

