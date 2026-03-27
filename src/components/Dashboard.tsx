import { Target, Landmark } from "lucide-react";
import { Card as SRCard, SRSettings } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import ProgressRing from "@/components/ProgressRing";
import { useDashboardData } from "@/hooks/useDashboardData";
import { motion } from "framer-motion";
import { ExamProgressBar } from "./dashboard/ExamProgressBar";
import { CoreStats } from "./dashboard/CoreStats";
import { DailyBriefing } from "./dashboard/DailyBriefing";
import { IdealFocus } from "./dashboard/IdealFocus";
import { VelocityWidget } from "./dashboard/VelocityWidget";
import { StatusIconsRow } from "./dashboard/StatusIconsRow";
import { useForumContext } from "./gamification/ForumContext";
import { Link } from "react-router-dom";

interface Props {
  stats: { due: number; total: number; totalSections: number; learnedSections: number };
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  categories: string[];
  subcategories: Record<string, string[]>;
  cards: SRCard[];
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
  onExport?: () => void;
}

export default function Dashboard({ stats, categoryStats, categories, subcategories, cards, reviewLog, srSettings, onExport }: Props) {
  const {
    wc, todayReviews, dailyGoal, goalProgress, pendingFirstReview, streak,
    focusRatio, actualRatio, autoSuggestion, storageUsage, plannerData,
    velocityData, weakestCategories, briefText, statusIcons, statusColor, statusMessage,
  } = useDashboardData(stats, categoryStats, categories, cards, reviewLog, srSettings);
  const { unlocked } = useForumContext();

  return (
    <div className="space-y-6">
      {wc.showExamProgress && (
        <ExamProgressBar
          learnedSections={stats.learnedSections}
          totalSections={stats.totalSections}
          statusMessage={statusMessage}
          statusColor={statusColor}
        />
      )}

      {wc.showCoreStats && (
        <CoreStats
          due={stats.due}
          learnedSections={stats.learnedSections}
          totalSections={stats.totalSections}
          pendingFirstReview={pendingFirstReview}
        />
      )}

      {wc.showProgressRing && plannerData && plannerData.activePhase && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="rounded-xl bg-card border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Progres faze: {plannerData.activePhase.name}</h3>
          </div>
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
        </motion.div>
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

      {wc.showStatusIcons && (
        <StatusIconsRow icons={statusIcons} onExport={onExport} storagePercent={storageUsage?.percent} />
      )}

      {unlocked && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <Link to="/forum" className="block glass-card border border-gold/30 rounded-xl p-5 hover:border-gold/50 transition-colors group">
            <div className="flex items-center gap-3">
              <Landmark className="h-5 w-5 text-gold flex-shrink-0" />
              <div>
                <h3 className="text-sm font-semibold text-gold tracking-[0.1em] font-display">ENTER THE FORVM</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Forum Iustitiae — tvoj hram znanja</p>
              </div>
            </div>
          </Link>
        </motion.div>
      )}
    </div>
  );
}
