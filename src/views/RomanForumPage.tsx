import { useMemo, useState, useEffect, useDeferredValue } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useCardContext } from "@/contexts/AppContext";
import { calculateForumState } from "@/lib/forum-logic";
import { ForumAtmosphere } from "@/components/gamification/ForumAtmosphere";
import { MonumentCard } from "@/components/gamification/MonumentCard";
import { MonumentInterior } from "@/components/gamification/MonumentInterior";
import { Progress } from "@/components/ui/progress";
import { loadSources, onSourcesChanged, type Source } from "@/lib/sources-storage";

export default function RomanForumPage() {
  const { cards, reviewLog, bulkUpdateChapter, reviewSection } = useCardContext();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  useEffect(() => {
    loadSources().then(setSources);
    return onSourcesChanged(() => loadSources().then(setSources));
  }, []);

  const deferredCards = useDeferredValue(cards);

  const forumState = useMemo(() => {
    return calculateForumState(deferredCards, reviewLog, sources);
  }, [deferredCards, sources, reviewLog]);

  const selectedMonument = selectedCategory
    ? forumState.monuments.find((m) => m.category === selectedCategory) ?? null
    : null;

  return (
    <div className="relative max-w-6xl mx-auto px-6 py-8 min-h-[80vh]">
      <ForumAtmosphere dayPhase={forumState.dayPhase} warmth={forumState.warmth} />

      <LayoutGroup>
        <AnimatePresence>
          {selectedMonument ? (
            <MonumentInterior
              key="interior"
              monument={selectedMonument}
              sources={sources}
              onBack={() => setSelectedCategory(null)}
              onUpdateChapters={bulkUpdateChapter}
              onReviewSection={reviewSection}
            />
          ) : (
            <motion.div
              key="forum-grid"
              className="relative z-10"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <motion.div layoutId="forum-gateway" className="sticky top-0 glass-card px-6 py-4 mb-8 z-20">
                <div className="flex items-center justify-between">
                  <h1 className="text-2xl font-bold tracking-[0.15em] text-gold">
                    FORUM ZNANJA
                  </h1>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="tabular-nums">{forumState.velocity} kartica / 7 dana</span>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <span className="text-[10px] uppercase tracking-wider">Napredak</span>
                      <Progress value={forumState.overallMastery} className="h-1.5 flex-1" />
                      <span className="tabular-nums font-medium text-foreground">{forumState.overallMastery}%</span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Monument Grid */}
              {forumState.monuments.length === 0 ? (
                <div className="glass-card flex items-center justify-center min-h-[40vh] px-6">
                  <p className="text-muted-foreground text-sm italic">
                    Nema kategorija. Kreiraj kartice da bi se Forum izgradio.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {forumState.monuments.map((monument, i) => (
                    <MonumentCard
                      key={monument.category}
                      monument={monument}
                      index={i}
                      onClick={() => setSelectedCategory(monument.category)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}
