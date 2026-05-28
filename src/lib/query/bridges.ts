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
  // to RAM + persist-queue. Invalidates every scoped cards query.
  onCardsChanged(() => {
    void qc.invalidateQueries({ queryKey: ["cards"] });
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

}

/** Test-only helper — resetuje internal flag tako da test može re-instalirati bridge sa svježim mockom. */
export function _resetBridgesForTest(): void {
  _installed = false;
}
