import { useMemo } from "react";
import { useCardContext } from "@/contexts/AppContext";
import { loadReviewLog } from "@/lib/storage";
import { calculateForumState } from "@/lib/forum-logic";
import { ForumAtmosphere } from "@/components/gamification/ForumAtmosphere";
import { MonumentCard } from "@/components/gamification/MonumentCard";
import { Progress } from "@/components/ui/progress";

export default function RomanForumPage() {
  const { cards } = useCardContext();

  const forumState = useMemo(() => {
    const reviewLog = loadReviewLog();
    return calculateForumState(
      Object.values(cards),
      reviewLog,
    );
  }, [cards]);

  return (
    <div className="relative max-w-6xl mx-auto px-6 py-8 min-h-[80vh]">
      {/* Atmospheric background layer */}
      <ForumAtmosphere dayPhase={forumState.dayPhase} warmth={forumState.warmth} />

      {/* Header */}
      <div className="relative z-10 sticky top-0 glass-card px-6 py-4 mb-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-[0.15em] text-gold font-display">
            FORVM IVSTITIAE
          </h1>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="tabular-nums">{forumState.velocity} acta / VII dies</span>
            <div className="flex items-center gap-2 min-w-[120px]">
              <span>Imperivm</span>
              <Progress value={forumState.overallMastery} className="h-1.5 flex-1" />
              <span className="tabular-nums font-medium text-foreground">{forumState.overallMastery}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monument Grid */}
      <div className="relative z-10">
        {forumState.monuments.length === 0 ? (
          <div className="glass-card flex items-center justify-center min-h-[40vh] px-6">
            <p className="text-muted-foreground text-sm italic font-display">
              Nulla monumenta. Crea disciplinas ut Forum aedificētur.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {forumState.monuments.map((monument, i) => (
              <MonumentCard key={monument.category} monument={monument} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
