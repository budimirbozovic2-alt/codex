import { Clock, RefreshCw, Shield, Flame, Zap, Lightbulb, AlertTriangle, Settings2, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PlannerConfig, calcRebalancedQuota } from "@/lib/planner-storage";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import SubjectCard from "./SubjectCard";
import { STATUS_CONFIG, PHASE_COLORS } from "./planner-constants";
import type { SubjectPlan, SmartSuggestionItem, TimeRecommendation, CognitiveDebtItem, LearningReviewRatio } from "@/types/planner";

interface Props {
  config: PlannerConfig;
  save: (c: PlannerConfig) => void;
  subjectPlans: SubjectPlan[];
  velocity: number;
  remaining: number;
  estimatedFinish: Date | null;
  plannerStatus: { status: string; daysLate: number };
  smartSuggestion: SmartSuggestionItem | null;
  timeRec: TimeRecommendation | null;
  debt: CognitiveDebtItem | null;
  dueCount: number;
  learningRatio: LearningReviewRatio;
  overallPct: number;
  onNavigateToDatabase?: (category: string) => void;
  onOpenWizard: () => void;
}

export default function OperationsTab({
  config, save, subjectPlans,
  velocity, remaining, estimatedFinish, plannerStatus,
  smartSuggestion, timeRec, debt, dueCount, learningRatio, overallPct,
  onNavigateToDatabase, onOpenWizard,
}: Props) {
  const statusCfg = STATUS_CONFIG[plannerStatus.status as keyof typeof STATUS_CONFIG];
  const StatusIcon = statusCfg.icon;

  const handleRebalance = () => {
    const result = calcRebalancedQuota(remaining, config.finalGoalDate, config.bufferPercent);
    if (!result) return;
    save({ ...config });
  };

  return (
    <>
      {/* ─── Subject Plans ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-xl bg-card border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-medium">Plan po predmetima</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {config.finalGoalDate && `Ispit: ${format(new Date(config.finalGoalDate), "dd.MM.yyyy")}`}
              {config.bufferPercent > 0 && ` • Buffer: ${config.bufferPercent}%`}
            </span>
            <Button variant="ghost" size="sm" onClick={onOpenWizard} className="gap-1.5 text-xs">
              <Settings2 className="h-3.5 w-3.5" /> Rekonfiguriši
            </Button>
          </div>
        </div>

        {/* Timeline bar */}
        {subjectPlans.length > 0 && (
          <div className="flex h-6 rounded-lg overflow-hidden bg-secondary">
            {subjectPlans.map((p, i) => {
              const totalDays = subjectPlans.reduce((s, sp) => s + sp.allocatedDays, 0) || 1;
              return (
                <div
                  key={p.categoryId}
                  style={{ width: `${(p.allocatedDays / totalDays) * 100}%`, backgroundColor: PHASE_COLORS[i % PHASE_COLORS.length] }}
                  className="flex items-center justify-center overflow-hidden"
                >
                  <span className="text-[9px] font-bold text-primary-foreground truncate px-1">{p.categoryName}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Subject cards */}
        {subjectPlans.length > 0 ? (
          <div className="space-y-2">
            {subjectPlans.map((plan, i) => (
              <SubjectCard key={plan.categoryId} plan={plan} index={i} onNavigate={onNavigateToDatabase} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Plan nije konfigurisan.</p>
            <Button variant="outline" size="sm" onClick={onOpenWizard} className="mt-3 gap-1.5">
              <Settings2 className="h-3.5 w-3.5" /> Podesi plan
            </Button>
          </div>
        )}
      </motion.div>

      {/* ─── Learning/Review Ratio ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="rounded-xl bg-card border p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Omjer učenje / ponavljanje</h3>
        </div>
        <p className="text-xs text-muted-foreground">{learningRatio.label} — Ukupni progres: {overallPct}%</p>
        <div className="flex h-4 rounded-full overflow-hidden bg-secondary">
          <div
            className="bg-primary flex items-center justify-center transition-all"
            style={{ width: `${learningRatio.learnPct}%` }}
          >
            <span className="text-[9px] font-bold text-primary-foreground">Učenje {learningRatio.learnPct}%</span>
          </div>
          <div
            className="bg-success flex items-center justify-center transition-all"
            style={{ width: `${learningRatio.reviewPct}%` }}
          >
            <span className="text-[9px] font-bold text-success-foreground">Ponavljanje {learningRatio.reviewPct}%</span>
          </div>
        </div>
      </motion.div>

      {/* ─── Reality Check ─── */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-xl bg-card border p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-medium">Reality Check</h3>
          </div>
          {plannerStatus.status === "red" && config.finalGoalDate && (
            <Button variant="outline" size="sm" onClick={handleRebalance} className="gap-1.5 text-xs">
              <RefreshCw className="h-3.5 w-3.5" /> Niveliši plan
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-2xl tabular-nums">{velocity.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">cjelina/dan (7d)</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-2xl tabular-nums">{remaining}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">preostalo</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-2xl tabular-nums">
              {estimatedFinish ? format(estimatedFinish, "dd.MM.yy") : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">proj. završetak</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50 text-center">
            <p className="text-2xl tabular-nums">
              {config.finalGoalDate ? format(new Date(config.finalGoalDate), "dd.MM.yy") : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">cilj</p>
          </div>
        </div>

        {/* Status light */}
        <div className={cn("flex items-start gap-3 p-4 rounded-xl border", statusCfg.bg)}>
          <StatusIcon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", statusCfg.color)} />
          <div>
            <p className={cn("text-sm font-medium", statusCfg.color)}>
              {plannerStatus.status === "green" && statusCfg.label}
              {plannerStatus.status === "yellow" && `Kasniš ${plannerStatus.daysLate} dana. Povećaj tempo.`}
              {plannerStatus.status === "red" && `Tvoj trenutni tempo nije dovoljan. Kasniš ${plannerStatus.daysLate} dana. Koristi "Niveliši plan".`}
              {plannerStatus.status === "no-goal" && statusCfg.label}
            </p>
            {plannerStatus.status !== "no-goal" && plannerStatus.status !== "green" && (
              <p className="text-xs text-muted-foreground mt-1">
                Potrebna brzina: {remaining > 0 && config.finalGoalDate
                  ? `${Math.ceil(remaining / Math.max(1, Math.round(differenceInDays(new Date(config.finalGoalDate), new Date()) * (1 - config.bufferPercent / 100))))} cjelina/dan`
                  : "—"}
              </p>
            )}
          </div>
        </div>

        {/* Smart daily suggestion */}
        {smartSuggestion && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
            <Lightbulb className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Smart Load Balancing</p>
              <p className="text-xs text-muted-foreground mt-0.5">{smartSuggestion.message}</p>
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {smartSuggestion.suggestedToday > 0 && (
                  <p className="text-lg font-medium text-primary">{smartSuggestion.suggestedToday} novih cjelina</p>
                )}
                {timeRec && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{timeRec.message}</span>
                    <span className="text-[10px]">({dueCount} dospjelih + {smartSuggestion.suggestedToday} novih)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Burnout Protection */}
        {smartSuggestion?.burnoutWarning && (
          <div className="flex items-start gap-3 p-3 rounded-xl border border-warning/30 bg-warning/5">
            <Flame className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-warning">Visok rizik od zamora</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Dnevna kvota od {smartSuggestion.suggestedToday} kartica prelazi sigurnu granicu (60). Razmisli o produženju plana ili smanjenju buffera.
              </p>
            </div>
          </div>
        )}

        {/* Cognitive debt */}
        {debt && (
          <div className="flex items-start gap-3 p-3 rounded-xl border border-warning/30 bg-warning/5">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-xs text-warning">{debt.message}</p>
          </div>
        )}
      </motion.div>
    </>
  );
}
