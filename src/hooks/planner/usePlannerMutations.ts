/**
 * PR-7f M3a — Planner cut-over.
 *
 * Sve write-pozive na `planner-storage` rutiramo kroz `useMutation`:
 *   - optimistic `setQueryData` u onMutate (snapshot za rollback),
 *   - rollback iz onError ctx,
 *   - bridge (`onPlannerChanged → invalidateQueries(['planner'])`)
 *     automatski refetcha derived calcove nakon što repo emituje notify.
 *
 * Ref-Delta + ručno seedanje cache-a iz `usePlannerData.save` zamijenjeno
 * je standardnim TanStack lifecycle-om.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import type { PlannerConfig } from "@/lib/planner-storage";
import type { DisciplineEntry } from "@/lib/planner/types";

type PlannerModule = typeof import("@/lib/planner-storage");
let _plannerMod: PlannerModule | null = null;
async function getPlannerModule(): Promise<PlannerModule> {
  if (!_plannerMod) _plannerMod = await import("@/lib/planner-storage");
  return _plannerMod;
}

interface ConfigCtx { prev: PlannerConfig | undefined }
interface DisciplineCtx { prev: DisciplineEntry[] | undefined }
interface DailyMappedCtx {} // counter — bez optimistic seeda (UI ne čita iz cache-a direktno)

export function usePlannerMutations() {
  const qc = useQueryClient();

  // B2 — `mod.savePlanner(cfg)` is synchronous and fires
  // `notifyPlannerChanged("config")` inside the same tick. The bridge
  // invalidates `['planner']` root → `planner.config()` refetches before
  // React commits, so an optimistic `setQueryData` here was never visible
  // to the UI. We keep `cancelQueries + snapshot` for rollback only.
  const saveConfig = useMutation<void, Error, PlannerConfig, ConfigCtx>({
    mutationFn: async (cfg) => {
      const mod = await getPlannerModule();
      mod.savePlanner(cfg);
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.planner.config() });
      const prev = qc.getQueryData<PlannerConfig>(queryKeys.planner.config());
      return { prev };
    },
    onError: (_e, _cfg, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.planner.config(), ctx.prev);
      }
    },
    // onSettled: bridge already invalidates ['planner'] via notify.
  });

  const recordDiscipline = useMutation<
    DisciplineEntry,
    Error,
    { date: string; reviewsDone: number; dailyGoal: number; slippageMs: number | null },
    DisciplineCtx
  >({
    mutationFn: async ({ date, reviewsDone, dailyGoal, slippageMs }) => {
      const mod = await getPlannerModule();
      return mod.recordDayDiscipline(date, reviewsDone, dailyGoal, slippageMs);
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: queryKeys.planner.disciplineLog() });
      const prev = qc.getQueryData<DisciplineEntry[]>(queryKeys.planner.disciplineLog());
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.planner.disciplineLog(), ctx.prev);
      }
    },
  });

  const incrementMapped = useMutation<number, Error, number, DailyMappedCtx>({
    mutationFn: async (amount) => {
      const mod = await getPlannerModule();
      return mod.incrementDailyMapped(amount);
    },
    // Bez optimistic seeda — counter se čita kroz `getDailyMappedCount()` u
    // useDeferredCompute, a bridge invalidira ['planner'] nakon notify.
  });

  return { saveConfig, recordDiscipline, incrementMapped };
}
