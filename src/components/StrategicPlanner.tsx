import { Target, BarChart3, Map as MapIcon, Gauge, HelpCircle } from "lucide-react";
import { useState, lazy, Suspense, useMemo } from "react";
import { m } from "framer-motion";
import InfoPanel from "@/components/InfoPanel";
import { Card as SRCard } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import type { CategoryRecord } from "@/lib/db-types";
import { cn } from "@/lib/utils";
import { usePlannerData } from "@/hooks/usePlannerData";
import PlannerSetupWizard from "./planner/PlannerSetupWizard";
import PlannerTabSkeleton from "./planner/PlannerTabSkeleton";

// Lazy-loaded tab chunks — skeleton doubles as both data-loading and code-loading fallback.
const OperationsTab = lazy(() => import("./planner/OperationsTab"));
const RoadmapTab    = lazy(() => import("./planner/RoadmapTab"));
const DisciplineTab = lazy(() => import("./planner/DisciplineTab"));

// Idempotent prefetch helpers — invoked on hover/focus of tab triggers.
const prefetchers: Record<"operations" | "roadmap" | "discipline", () => void> = {
  operations: () => { void import("./planner/OperationsTab"); },
  roadmap:    () => { void import("./planner/RoadmapTab"); },
  discipline: () => { void import("./planner/DisciplineTab"); },
};

interface Props {
  cards: SRCard[];
  categories: string[];
  categoryRecords: CategoryRecord[];
  reviewLog: ReviewLogEntry[];
  onNavigateToDatabase?: (category: string) => void;
  onShowOnboarding?: () => void;
}

export default function StrategicPlanner({ cards, categories, categoryRecords, reviewLog, onNavigateToDatabase, onShowOnboarding }: Props) {
  const data = usePlannerData(cards, reviewLog, categoryRecords);
  const [activeTab, setActiveTab] = useState<"operations" | "roadmap" | "discipline">("operations");
  const [showWizard, setShowWizard] = useState(!data.isConfigured);

  // Local narrows `subjectPlans` to `SubjectPlan[]` for the loaded branch.
  const { subjectPlans } = data;

  // Two-step memo: derive the primitive name first, then wrap into an object
  // keyed on that string. As long as the active phase name is unchanged the
  // `currentPhase` reference stays identical across `usePlannerData` ticks —
  // DisciplineTab (memo'd consumer) skips re-render entirely.
  const currentPhaseName = useMemo(
    () => subjectPlans?.find(p => p.pct < 100)?.categoryName ?? null,
    [subjectPlans],
  );
  const currentPhase = useMemo(
    () => (currentPhaseName ? { name: currentPhaseName } : null),
    [currentPhaseName],
  );


  return (
    <div className="space-y-6">
      {showWizard && (
        <PlannerSetupWizard
          config={data.config}
          save={data.save}
          categoryRecords={categoryRecords}
          cards={cards}
          onClose={() => setShowWizard(false)}
        />
      )}

      <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2"><Gauge className="h-6 w-6 text-primary" /> Strateški planer</h2>
            <p className="text-muted-foreground mt-1">Adaptivni sistem — plan se prilagođava tvom tempu</p>
          </div>
          <div className="flex items-center gap-1">
            <InfoPanel title="Kako radi Strateški planer?">
              <p><strong className="text-foreground">Plan po predmetima</strong> — sistem automatski generiše raspored na osnovu broja cjelina i težine predmeta. Teški predmeti dobijaju 1.5× više vremena.</p>
              <p><strong className="text-foreground">Omjer učenje/ponavljanje</strong> — dinamički se prilagođava: na početku 90% učenje, pri kraju 90% ponavljanje.</p>
              <p><strong className="text-foreground">Buffer %</strong> — sigurnosna zona (podrazumijevano 15%) — sistem računa kao da ispit počinje ranije.</p>
              <p><strong className="text-foreground">Niveliši plan</strong> — raspoređuje kognitivni dug ravnomjerno na preostale dane.</p>
              <p><strong className="text-foreground">Mapa puta</strong> — Burn-up grafikon i tekstualna simulacija završetka.</p>
              <p><strong className="text-foreground">Disciplina</strong> — Rocket Streak, 14-dnevni grid i trend dosljednosti.</p>
              <div className="pt-1 border-t border-border mt-1">
                <p className="font-medium text-foreground mb-1">Prečice</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><span>Brza pretraga</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">Ctrl+K</kbd></div>
                  <div className="flex items-center justify-between"><span>Workflow sidebar</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">M</kbd></div>
                  <div className="flex items-center justify-between"><span>Zatvori modal</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">ESC</kbd></div>
                </div>
              </div>
            </InfoPanel>
            {onShowOnboarding && (
              <button
                onClick={onShowOnboarding}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
                title="Vodič za planer"
                aria-label="Vodič za planer"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Onboarding</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 mt-4 p-1 rounded-lg bg-secondary/50">
          {([
            { key: "operations" as const, label: "Operativni plan", icon: Target },
            { key: "roadmap" as const, label: "Mapa puta", icon: MapIcon },
            { key: "discipline" as const, label: "Disciplina", icon: BarChart3 },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              onMouseEnter={prefetchers[tab.key]}
              onFocus={prefetchers[tab.key]}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all",
                activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </m.div>

      {!data.isReady || subjectPlans === null ? (
        <PlannerTabSkeleton variant={activeTab} />
      ) : (
        <Suspense fallback={<PlannerTabSkeleton variant={activeTab} />}>
      {activeTab === "operations" && (
        <OperationsTab
          config={data.config}
          save={data.save}
          subjectPlans={subjectPlans}
          velocity={data.velocity}
          remaining={data.remaining}
          estimatedFinish={data.estimatedFinish}
          plannerStatus={data.plannerStatus ?? { status: "no-goal", daysLate: 0 }}
          smartSuggestion={data.smartSuggestion}
          timeRec={data.timeRec}
          debt={data.debt}
          dueCount={data.dueCount}
          learningRatio={data.learningRatio}
          overallPct={data.overallPct}
          retentionRisk={data.retentionRisk}
          categoryRecords={categoryRecords}
          onNavigateToDatabase={onNavigateToDatabase}
          onOpenWizard={() => setShowWizard(true)}
        />
      )}

      {activeTab === "roadmap" && (
        <RoadmapTab
          burnupData={data.burnupData}
          projectionText={data.projectionText}
          velocity={data.velocity}
          remaining={data.remaining}
          totalSections={data.totalSections}
          subjectPlans={subjectPlans}
          bufferPercent={data.config.bufferPercent}
        />
      )}

      {activeTab === "discipline" && (
        <DisciplineTab
          disciplineLog={data.disciplineLog}
          disciplineTrend={data.disciplineTrend}
          streak={data.streak}
          bestStreak={data.bestStreak}
          currentPhase={currentPhase}
          phaseDisciplinePct={data.phaseDisciplinePct}
        />
      )}
        </Suspense>
      )}
    </div>
  );
}
