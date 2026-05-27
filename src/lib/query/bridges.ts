/**
 * Modul-level bridge — postojeći SSOT eventovi pumpaju invalidaciju u
 * TanStack QueryClient. Bez ovog mosta TanStack ne bi znao za promjene
 * koje pišu Ref-Delta mutacije izvan njegovog `useMutation`.
 *
 * Pozvati JEDNOM (iz `client.ts`). Idempotentno — drugi poziv je no-op.
 */
import type { QueryClient } from "@tanstack/react-query";
import { onSourcesChanged } from "@/lib/sources-storage";
import { onPlannerChanged, type PlannerChangeKind } from "@/lib/planner";
import { onDraftsChanged, onSettingsChanged, onCardsChanged, onKnowledgeBaseChanged } from "@/lib/db/queries";
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
        void qc.invalidateQueries({ queryKey: ["planner"] });
        break;
      case "discipline":
        void qc.invalidateQueries({ queryKey: ["planner", "discipline"] });
        break;
      case "dailyMapped":
      case "lastRedistribute":
        void qc.invalidateQueries({ queryKey: ["planner"] });
        break;
    }
  });

  // ── Drafts ──────────────────────────────────────────────
  onDraftsChanged(() => {
    void qc.invalidateQueries({ queryKey: ["drafts"] });
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

  // ── Settings (prefix "" = sve mutacije) ─────────────────
  onSettingsChanged("", (key: string) => {
    void qc.invalidateQueries({ queryKey: ["settings", key] });
    // Subject overrides — invalidate scoped subject hooks.
    if (key.startsWith("sr-subject-settings-")) {
      void qc.invalidateQueries({ queryKey: ["subject-settings"] });
    }
  });
}

/** Test-only helper — resetuje internal flag tako da test može re-instalirati bridge sa svježim mockom. */
export function _resetBridgesForTest(): void {
  _installed = false;
}
