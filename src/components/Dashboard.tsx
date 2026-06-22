import { Target, Home } from "lucide-react";
import { useI18n } from "@/i18n";
import { Card as SRCard, SRSettings } from "@/lib/spaced-repetition";
import ActivityHeatmap from "@/components/ActivityHeatmap";
import { ReviewLogEntry } from "@/lib/storage";
import ProgressRing from "@/components/ProgressRing";
import { useDashboardData } from "@/hooks/useDashboardData";
import { PageHeader } from "@/components/ui/PageHeader";

import { ExamProgressBar } from "./dashboard/ExamProgressBar";
import { CoreStats } from "./dashboard/CoreStats";
import { DailyBriefing } from "./dashboard/DailyBriefing";
import { IdealFocus } from "./dashboard/IdealFocus";
import { VelocityWidget } from "./dashboard/VelocityWidget";
import { StatusIconsRow } from "./dashboard/StatusIconsRow";
import { StudyFlowWidget } from "./dashboard/StudyFlowWidget";
import type { CategoryRecord } from "@/lib/db-types";
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
  headerActions?: React.ReactNode;
}

export default function Dashboard({
  stats,
  categoryStats,
  categories,
  categoryRecords,
  subcategories: _subcategories,
  cards,
  reviewLog,
  srSettings,
  onExport,
  headerActions,
}: Props) {
  const { t } = useI18n();
  const {
    wc,
    todayReviews,
    dailyGoal,
    goalProgress,
    pendingFirstReview,
    streak,
    focusRatio,
    actualRatio,
    autoSuggestion,
    storageUsage,
    plannerData,
    velocityData,
    weakestCategories,
    weakestCategory,
    briefText,
    statusIcons,
    statusColor,
    statusMessage,
    studyFlowData,
  } = useDashboardData(
    stats,
    categoryStats,
    categories,
    categoryRecords,
    cards,
    reviewLog,
    srSettings,
  );

  const showTodayPair = studyFlowData != null || wc.showBriefing;
  const showPlannerPhase =
    wc.showProgressRing && plannerData?.activePhase != null;

  return (
    <div className="space-y-5 relative animate-fade-in">
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.title")}
        titleIcon={<Home className="h-5 w-5 text-primary/70 self-center" strokeWidth={1.5} />}
        actions={headerActions}
      />

      {wc.showStatusIcons && (
        <StatusIconsRow
          icons={statusIcons}
          onExport={onExport}
          storagePercent={storageUsage?.percent}
        />
      )}

      {wc.showExamProgress && (
        <ExamProgressBar
          learnedSections={stats.learnedSections}
          totalSections={stats.totalSections}
          statusMessage={statusMessage}
          statusColor={statusColor}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6 items-start">
        <div className="lg:col-span-2 min-w-0 flex flex-col gap-5">
          {wc.showCoreStats && (
            <CoreStats
              due={stats.due}
              pendingFirstReview={pendingFirstReview}
              weakest={weakestCategory}
            />
          )}

          {showTodayPair && (
            <div
              className={`grid gap-4 items-stretch ${
                studyFlowData && wc.showBriefing
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1"
              }`}
            >
              {studyFlowData && <StudyFlowWidget data={studyFlowData} />}
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
            </div>
          )}

          {showPlannerPhase && plannerData?.activePhase && (
            <div className="animate-fade-up glass-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-primary shrink-0" />
                <h3 className="text-eyebrow normal-case tracking-normal truncate">
                  Progres faze: {plannerData.activePhase.name}
                </h3>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
                <ProgressRing
                  percent={plannerData.activePhase.pct}
                  label="Ukupno"
                  sublabel={`${plannerData.activePhase.learned}/${plannerData.activePhase.total}`}
                  colorClass="text-primary"
                />
                <ProgressRing
                  percent={
                    plannerData.dailyQuota > 0
                      ? Math.min(
                          100,
                          Math.round(
                            (plannerData.dailyProgress / plannerData.dailyQuota) * 100,
                          ),
                        )
                      : 0
                  }
                  label="Danas"
                  sublabel={`${plannerData.dailyProgress}/${plannerData.dailyQuota}`}
                  colorClass={
                    plannerData.dailyProgress >= plannerData.dailyQuota &&
                    plannerData.dailyQuota > 0
                      ? "text-success"
                      : "text-warning"
                  }
                />
              </div>
              {plannerData.redistResult?.redistributed && (
                <p className="text-xs text-warning mt-4 text-center">
                  ⚡ Kvota automatski redistribuirana:{" "}
                  {plannerData.redistResult.newQuota} sekcija/dan
                </p>
              )}
            </div>
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

        <aside
          aria-label="Brze akcije i alati"
          className="lg:col-span-1 min-w-0 flex flex-col gap-4 lg:sticky lg:top-4 self-start"
        >
          <QuickActions dueCount={stats.due} hasCards={cards.length > 0} />
          <ToolCards layout="stack" />
          <BackupCard />
          {wc.showHeatmap && (
            <div className="glass-card rounded-xl p-4 overflow-x-auto">
              <ActivityHeatmap reviewLog={reviewLog} />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
