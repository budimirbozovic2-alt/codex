import { BarChart3, Clock, Target, Trophy, RotateCw, BookOpen, Check } from "lucide-react";
import React, { useEffect } from "react";
import { LearnMode } from "@/lib/storage";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { GRADE_LABELS } from "./types";
import { useT } from "@/lib/i18n/useT";

interface Props {
  learnMode: LearnMode;
  sessionStartTime: number;
  totalGrades: number[];
  modulesCompleted: number;
  chainResets: number;
  readCardsCount: number;
  completedCardsCount: number;
  chainCompletedCardsCount: number;
  onBack: () => void;
}

const SessionComplete = React.memo(function SessionComplete({
  learnMode, sessionStartTime, totalGrades, modulesCompleted, chainResets,
  readCardsCount, completedCardsCount, chainCompletedCardsCount, onBack,
}: Props) {
  const t = useT();

  useEffect(() => {
    import("@/lib/sounds").then(m => m.playSessionComplete());
  }, []);

  const elapsed = Date.now() - sessionStartTime;
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  const avgGrade = totalGrades.length > 0 ? (totalGrades.reduce((a, b) => a + b, 0) / totalGrades.length).toFixed(1) : "—";

  const statItems: { icon: typeof Clock; label: string; value: string | number }[] = [
    { icon: Clock, label: t("learnComplete.time"), value: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s` },
    { icon: Target, label: t("learnComplete.modulesCompleted"), value: modulesCompleted },
    { icon: BarChart3, label: t("learnComplete.avgGrade"), value: avgGrade },
  ];

  if (learnMode === "free") {
    statItems[1] = { icon: BookOpen, label: t("learnComplete.read"), value: readCardsCount };
  } else if (learnMode === "active-recall") {
    statItems.push({ icon: Trophy, label: t("learnComplete.questionsCompleted"), value: completedCardsCount });
  } else if (learnMode === "chain") {
    statItems.push({ icon: Trophy, label: t("learnComplete.chainsCompleted"), value: chainCompletedCardsCount });
    statItems.push({ icon: RotateCw, label: t("learnComplete.chainResets"), value: chainResets });
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto space-y-8 py-16">
      <div className="text-center space-y-3">
        <div className="inline-flex p-4 rounded-2xl bg-gold/10 mb-2">
          <Trophy className="h-10 w-10 text-gold" />
        </div>
        <h2 className="text-4xl font-bold">{t("learnComplete.title")}</h2>
        <p className="text-muted-foreground text-lg">{t("learnComplete.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {statItems.map(({ icon: StatIcon, label, value }) => (
          <div key={label} className="glass-card rounded-xl p-4 text-center space-y-1">
            <StatIcon className="h-5 w-5 text-muted-foreground mx-auto" />
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {totalGrades.length > 0 && (
        <div className="glass-card rounded-xl p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground text-center">{t("learnComplete.gradeDistribution")}</p>
          <div className="flex items-end justify-center gap-3 h-16">
            {[1, 2, 3, 4].map((g) => {
              const count = totalGrades.filter((x) => x === g).length;
              const pct = totalGrades.length > 0 ? (count / totalGrades.length) * 100 : 0;
              return (
                <div key={g} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 rounded-t-md transition-all ${g === 1 ? "bg-destructive/70" : g === 2 ? "bg-warning/70" : g === 3 ? "bg-primary/70" : "bg-success/70"}`}
                    style={{ height: `${Math.max(4, pct * 0.6)}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{GRADE_LABELS[g]}</span>
                  <span className="text-xs font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Button onClick={onBack} className="w-full btn-imperial bg-primary hover:bg-primary/90 text-primary-foreground">
        <Check className="h-4 w-4 mr-2" /> {t("learnComplete.concludeSession")}
      </Button>
    </motion.div>
  );
});

export default SessionComplete;
