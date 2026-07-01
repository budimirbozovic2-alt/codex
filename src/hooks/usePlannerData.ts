import { useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePlannerMutations } from "@/hooks/planner/usePlannerMutations";
import { usePlannerAutoRedistribute } from "@/hooks/planner/usePlannerAutoRedistribute";
import { Card as SRCard } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import type { CategoryRecord } from "@/lib/db-types";
import { analyticsClient } from "@/lib/analytics/analyticsClient";
import type { PlannerConfig } from "@/domains/planner";
import { DEFAULT_CONFIG, calcLearningReviewRatio } from "@/domains/planner";
import type { SubjectPlan } from "@/types/planner";
import { queryKeys } from "@/lib/query/keys";
import {
  hashCards,
  hashCategories,
  hashPlannerConfig,
} from "@/lib/query/hash";

// R2 fix: lazy-import planner-storage to avoid eagerly loading 577-line module + date-fns.
// B1 refactor: module reference is loaded ONCE via a TanStack query slot
// (`['planner','module']`) and reused by all derived `useMemo` blocks. This
// lets us drop the per-calc `useQuery` indirection (and its 3 useEffect
// invalidation cascades) — pure functions of (cards, reviewLog, config,
// categoryRecords) belong in `useMemo`, not in TanStack cache slots that
// the bridge already invalidates from a different angle.
type PlannerModule = typeof import("@/domains/planner");
type DisciplineLogEntry = import("@/types/planner").DisciplineLogEntry;
type DisciplineTrendPoint = import("@/types/planner").DisciplineTrendPoint;
const EMPTY_DISCIPLINE_LOG: DisciplineLogEntry[] = [];
const EMPTY_DISCIPLINE_TREND: DisciplineTrendPoint[] = [];
let _plannerMod: PlannerModule | null = null;
async function getPlannerModule(): Promise<PlannerModule> {
  if (!_plannerMod) _plannerMod = await import("@/domains/planner");
  return _plannerMod;
}

export function usePlannerData(cards: SRCard[], reviewLog: ReviewLogEntry[], categoryRecords: CategoryRecord[]) {
  const qc = useQueryClient();

  // ── Async I/O reads (stay on TanStack) ───────────────────────────────

  // Planner module reference — loaded once, then available to every
  // derived `useMemo` below. Stale-time is implicitly Infinity via the
  // QueryClient default; `_plannerMod` is also module-cached.
  const { data: mod } = useQuery({
    queryKey: ["planner", "module"] as const,
    queryFn: getPlannerModule,
  });

  // PR-7f M2 — config kroz TanStack; bridge invalidira ['planner'] na svaki
  // `plannerCache.set` (kind="config"), pa useQuery sam re-fetcha.
  const { data: config = DEFAULT_CONFIG, isFetched: isConfigLoaded } = useQuery({
    queryKey: queryKeys.planner.config(),
    queryFn: async () => {
      const m = mod ?? (await getPlannerModule());
      return m.loadPlanner();
    },
    initialData: DEFAULT_CONFIG,
  });

  const { data: disciplineLogData = null, isPending: disciplineLogPending } = useQuery({
    queryKey: queryKeys.planner.disciplineLog(),
    queryFn: async () => {
      const m = mod ?? (await getPlannerModule());
      return m.loadDisciplineLog();
    },
    enabled: !!mod,
  });

  const { data: disciplineTrendData = null, isPending: disciplineTrendPending } = useQuery({
    queryKey: queryKeys.planner.disciplineTrend(30),
    queryFn: async () => {
      const m = mod ?? (await getPlannerModule());
      return m.getDisciplineTrend(30);
    },
    enabled: !!mod,
  });

  const disciplineLog = disciplineLogData ?? EMPTY_DISCIPLINE_LOG;
  const disciplineTrend = disciplineTrendData ?? EMPTY_DISCIPLINE_TREND;
  const isDisciplineReady = !!mod && !disciplineLogPending && !disciplineTrendPending;

  // ── Counts / sync derivations ────────────────────────────────────────

  const totalSections = useMemo(() => cards.reduce((s, c) => s + c.sections.length, 0), [cards]);
  const learnedSections = useMemo(() => {
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) count++; }));
    return count;
  }, [cards]);
  const remaining = totalSections - learnedSections;
  const overallPct = totalSections > 0 ? Math.round((learnedSections / totalSections) * 100) : 0;

  const dueCount = useMemo(() => {
    const now = Date.now();
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.nextReview && s.nextReview <= now) count++; }));
    return count;
  }, [cards]);

  const snapshot = useMemo(() => {
    if (!mod || !config.finalGoalDate) return null;
    return mod.computePlannerSnapshot({
      cards,
      reviewLog,
      categoryRecords,
      config,
      totalSections,
      learnedSections,
      dueCount,
    });
  }, [mod, cards, reviewLog, categoryRecords, config, totalSections, learnedSections, dueCount]);

  const subjectPlans: SubjectPlan[] | null = snapshot?.subjectPlans ?? null;
  const velocity = snapshot?.velocity ?? null;
  const estimatedFinish = snapshot?.estimatedFinish ?? null;
  const plannerStatus = snapshot?.plannerStatus ?? null;
  const smartSuggestion = snapshot?.smartSuggestion ?? null;
  const timeRec = snapshot?.timeRec ?? null;
  const dailyProgress = snapshot?.dailyProgress ?? 0;
  const dailyQuota = snapshot?.dailyQuota ?? 0;
  const learnTarget = snapshot?.learnTarget ?? 0;
  const reviewTarget = snapshot?.reviewTarget ?? 0;
  const activeSubjectPlan = snapshot?.activeSubjectPlan ?? null;
  const debt = snapshot?.debt ?? null;

  const burnupData = useMemo(() => {
    if (!mod) return null;
    return mod.buildBurnupData(reviewLog, totalSections, config.finalGoalDate, config.bufferPercent);
  }, [mod, reviewLog, totalSections, config.finalGoalDate, config.bufferPercent]);

  const projectionText = useMemo<string>(() => {
    if (!mod || velocity === null) return "";
    return mod.getProjectionText(velocity, remaining, config.finalGoalDate, config.bufferPercent);
  }, [mod, velocity, remaining, config.finalGoalDate, config.bufferPercent]);

  const phaseDisciplinePct = useMemo<number>(() => {
    if (!mod || disciplineLog.length === 0) return 0;
    return mod.getPhaseDisciplinePct(disciplineLog);
  }, [mod, disciplineLog]);

  const learningRatio = snapshot?.learningRatio ?? calcLearningReviewRatio(overallPct);

  const streaks = useMemo(() => {
    if (disciplineLog.length === 0) return { streak: 0, bestStreak: 0 };
    let streak = 0;
    const sorted = [...disciplineLog].sort((a, b) => b.date.localeCompare(a.date));
    for (const entry of sorted) {
      if (entry.status === "diligent") streak++;
      else break;
    }
    let best = 0, cur = 0;
    const asc = [...disciplineLog].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of asc) {
      if (e.status === "diligent") { cur++; best = Math.max(best, cur); }
      else cur = 0;
    }
    return { streak, bestStreak: best };
  }, [disciplineLog]);

  // ── Async derivation kept on TanStack (Web Worker call) ──────────────
  //
  // `retentionRisk` cannot be a `useMemo` because the analytics worker is
  // async. We keep ONE narrow invalidation effect (down from 9) that fires
  // when its inputs change. Bridge `['planner']` invalidation also covers
  // config writes; this effect catches cards/categoryRecords changes which
  // don't go through `notifyPlannerChanged`.
  //
  // PR-G5 / RC-5: removed `reviewLogHash` — it was computed every render
  // but never used (the worker call doesn't depend on reviewLog).
  const cardsHash = useMemo(() => hashCards(cards), [cards]);
  const categoryHash = useMemo(() => hashCategories(categoryRecords), [categoryRecords]);
  const configHash = useMemo(() => hashPlannerConfig(config), [config]);

  useEffect(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.planner.retentionRisk() });
  }, [qc, cardsHash, categoryHash, configHash]);

  const { data: retentionRisk = [] } = useQuery({
    queryKey: queryKeys.planner.retentionRisk(),
    queryFn: async () => {
      const catIds = categoryRecords.map(r => r.id);
      if (catIds.length === 0) return [];
      const result = await analyticsClient.runCategoryStability(cards, catIds, config.finalGoalDate ?? null);
      return [...result].sort((a, b) => a.avgRetrievability - b.avgRetrievability);
    },
    // PR-G5 / RC-5: default staleTime (0) caused the analytics Worker to
    // re-run on every mount/focus event even when no inputs changed. The
    // hash-driven effect above is the SSOT for refetch triggers; Infinity
    // here delegates entirely to it.
    staleTime: Infinity,
  });

  const isConfigured = config.dailyAvailableMinutes > 0 && !!config.finalGoalDate;

  const redistResult = usePlannerAutoRedistribute(
    cards,
    config.finalGoalDate,
    config.bufferPercent,
  );

  // PR-7f M3a — save kroz useMutation (optimistic + rollback via ctx.prev).
  // Bridge `domain:changed{planner, config}` invalidira ['planner'] nakon notify.
  const { saveConfig } = usePlannerMutations();
  const save = useCallback((updated: PlannerConfig) => {
    saveConfig.mutate(updated);
  }, [saveConfig]);

  // Nivelisana kvota više nije potrebna kad je plan ponovo na zelenom.
  useEffect(() => {
    if (config.dailyQuotaOverride == null || plannerStatus?.status !== "green") return;
    save({ ...config, dailyQuotaOverride: null });
  }, [config, plannerStatus, save]);

  return {
    config, save, isConfigured, isConfigLoaded,
    /** True once the lazy planner module + derived calcs are ready. */
    isReady: !!mod && isConfigLoaded,
    totalSections, learnedSections, remaining, overallPct, velocity,
    estimatedFinish, plannerStatus,
    subjectPlans, learningRatio,
    smartSuggestion, dueCount,
    timeRec, debt,
    dailyProgress, dailyQuota, learnTarget, reviewTarget, activeSubjectPlan,
    retentionRisk,
    disciplineLog, disciplineTrend, phaseDisciplinePct, isDisciplineReady,
    burnupData, projectionText,
    streak: streaks?.streak ?? 0,
    bestStreak: streaks?.bestStreak ?? 0,
    redistResult,
  };
}
