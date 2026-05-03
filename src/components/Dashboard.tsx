import { Target, Home } from "lucide-react";
import { Card as SRCard, SRSettings } from "@/lib/spaced-repetition";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import { ReviewLogEntry } from "@/lib/storage";
import ProgressRing from "@/components/ProgressRing";
import { useDashboardData } from "@/hooks/useDashboardData";

import { ExamProgressBar } from "./dashboard/ExamProgressBar";
import { CoreStats } from "./dashboard/CoreStats";
import { DailyBriefing } from "./dashboard/DailyBriefing";
import { IdealFocus } from "./dashboard/IdealFocus";
import { VelocityWidget } from "./dashboard/VelocityWidget";
import { StatusIconsRow } from "./dashboard/StatusIconsRow";
import { StudyFlowWidget } from "./dashboard/StudyFlowWidget";
import { CategoryRecord } from "@/lib/db";
import { QuickActions } from "./dashboard/QuickActions";
import { ToolCards } from "./dashboard/ToolCards";
import { BackupCard } from "./dashboard/BackupCard";

interface Props {
  stats: { due: number; total: number; totalSections: number; learnedSections: number };
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  categories: string[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
  cards: SRCard[];
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
  onExport?: () => void;
}

export default function Dashboard({ stats, categoryStats, categories, categoryRecords, subcategories, cards, reviewLog, srSettings, onExport }: Props) {
  const {
    wc, todayReviews, dailyGoal, goalProgress, pendingFirstReview, streak,
    focusRatio, actualRatio, autoSuggestion, storageUsage, plannerData,
    velocityData, weakestCategories, weakestCategory, briefText, statusIcons, statusColor, statusMessage,
    studyFlowData,
  } = useDashboardData(stats, categoryStats, categories, categoryRecords, cards, reviewLog, srSettings);
  return (
    <div className="space-y-6 relative">
      <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
        <Home className="h-6 w-6 text-primary" /> Početna tabla
      </h2>

      {/* Warnings strip — promoted to the top so alerts are immediately visible */}
      {wc.showStatusIcons && (
        <StatusIconsRow icons={statusIcons} onExport={onExport} storagePercent={storageUsage?.percent} />
      )}

      {wc.showExamProgress && (
        <ExamProgressBar
          learnedSections={stats.learnedSections}
          totalSections={stats.totalSections}
          statusMessage={statusMessage}
          statusColor={statusColor}
        />
      )}

      {/*
        Layout contract:
        - 3-col grid on lg+: analytics span 2, actions occupy 1 (sticky rail).
        - items-start prevents the right rail from stretching to match the
          (potentially huge) analytics column.
        - The actions <aside> is lg:sticky so Strateški planer / Statistika
          NEVER scroll out of the viewport regardless of planner payload size.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Analytics column (everything dynamic) */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {wc.showCoreStats && (
            <CoreStats
              due={stats.due}
              pendingFirstReview={pendingFirstReview}
              weakest={weakestCategory}
            />
          )}

          {wc.showProgressRing && plannerData && plannerData.activePhase && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 glass-card p-5 h-full flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">Progres faze: {plannerData.activePhase.name}</h3>
              </div>
              {/* Bounded inner area — planner data scrolls inside the card
                  instead of expanding the card and pushing siblings around. */}
              <div className="max-h-72 overflow-y-auto pr-1">
                <div className="flex items-center justify-around">
                  <ProgressRing
                    percent={plannerData.activePhase.pct}
                    label="Ukupno"
                    sublabel={`${plannerData.activePhase.learned}/${plannerData.activePhase.total}`}
                    colorClass="text-primary"
                  />
                  <ProgressRing
                    percent={plannerData.dailyQuota > 0 ? Math.min(100, Math.round((plannerData.dailyMapped / plannerData.dailyQuota) * 100)) : 0}
                    label="Danas"
                    sublabel={`${plannerData.dailyMapped}/${plannerData.dailyQuota}`}
                    colorClass={plannerData.dailyMapped >= plannerData.dailyQuota && plannerData.dailyQuota > 0 ? "text-success" : "text-warning"}
                  />
                </div>
                {plannerData.redistResult?.redistributed && (
                  <p className="text-xs text-warning mt-3 text-center">
                    ⚡ Kvota automatski redistribuirana: {plannerData.redistResult.newQuota} sekcija/dan
                  </p>
                )}
              </div>
            </div>
          )}

          {studyFlowData && (
            <StudyFlowWidget data={studyFlowData} />
          )}

          {wc.showBriefing && (
            <DailyBriefing
              briefText={briefText}
              timeRecMessage={plannerData?.timeRec?.message ?? null}
              todayReviews={todayReviews}
              dailyGoal={dailyGoal}
              goalProgress={goalProgress}
              streak={streak}
            />
          )}

          {wc.showIdealFocus && stats.totalSections > 0 && (
            <IdealFocus
              focusRatio={focusRatio}
              actualRatio={actualRatio}
              autoSuggestion={autoSuggestion}
              dailyGoal={dailyGoal}
            />
          )}

          {(wc.showVelocity || wc.showWeakCategories) && (
            <VelocityWidget
              velocityData={velocityData}
              weakestCategories={weakestCategories}
              showVelocity={wc.showVelocity}
              showWeakCategories={wc.showWeakCategories}
            />
          )}

        </div>

        {/* Action rail — locked, sticky on lg+, scrolls inner overflow on smaller widths */}
        <aside
          aria-label="Brze akcije"
          className="lg:col-span-1 lg:sticky lg:top-4 self-start space-y-4 min-w-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pr-1"
        >
          <QuickActions dueCount={stats.due} hasCards={cards.length > 0} />
          <ToolCards />
          <BackupCard />
          {wc.showHeatmap && (
            <div className="overflow-x-auto -mx-1 px-1">
              <ActivityHeatmap reviewLog={reviewLog} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
