/**
 * Direct TanStack invalidation for satellite domains (TD-ARCH-5).
 * Replaces event-bus → bridges indirection.
 */
import type { QueryClient } from "@tanstack/react-query";
import { queryClient } from "./client";
import { queryKeys } from "./keys";

export function invalidateSourcesQueries(qc: QueryClient = queryClient): void {
  void qc.invalidateQueries({ queryKey: ["sources"] });
}

export function invalidateMindMapsQueries(qc: QueryClient = queryClient): void {
  void qc.invalidateQueries({ queryKey: ["mindMaps"] });
}

export function invalidateMnemonicsQueries(qc: QueryClient = queryClient): void {
  void qc.invalidateQueries({ queryKey: ["mnemonics"] });
}

export function invalidateKnowledgeBaseQueries(
  qc: QueryClient = queryClient,
): void {
  void qc.invalidateQueries({ queryKey: ["knowledgeBase"] });
}

export function invalidatePlannerConfigDerived(
  qc: QueryClient = queryClient,
): void {
  void qc.invalidateQueries({
    queryKey: queryKeys.planner.root,
    predicate: (query) => {
      const k = query.queryKey;
      return k[0] === "planner" && k[1] !== "config";
    },
  });
}

export function invalidatePlannerDisciplineDerived(
  qc: QueryClient = queryClient,
): void {
  void qc.invalidateQueries({
    queryKey: queryKeys.planner.root,
    predicate: (query) => {
      const k = query.queryKey;
      return k[0] === "planner" && k[1] === "discipline" && k[2] !== "log";
    },
  });
}

/** Import / bulk satellite refresh — non-core TanStack domains. */
export function invalidateImportSatelliteQueries(
  qc: QueryClient = queryClient,
): void {
  invalidateSourcesQueries(qc);
  invalidateMindMapsQueries(qc);
  invalidateMnemonicsQueries(qc);
  invalidateKnowledgeBaseQueries(qc);
  invalidatePlannerConfigDerived(qc);
  invalidatePlannerDisciplineDerived(qc);
}
