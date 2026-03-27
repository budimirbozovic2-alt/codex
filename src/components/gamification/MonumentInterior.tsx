import { memo, useMemo, useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCardContext } from "@/contexts/AppContext";
import type { Monument } from "@/lib/forum-logic";
import { MATERIAL_ICONS } from "@/lib/forum-logic";
import { MonumentSVG } from "./monument-buildings";
import { ArchNode } from "./ArchNode";
import { useSourceHierarchy, type HierarchyNode } from "@/hooks/useSourceHierarchy";
import { getCardMasteryLevel } from "@/components/KnowledgeMap";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import type { Source } from "@/lib/db";

const MentalSkeleton = lazy(() => import("@/components/MentalSkeleton"));

interface Props {
  monument: Monument;
  sources: Source[];
  onBack: () => void;
  onUpdateChapters?: (updates: { id: string; chapter: string; chapterOrder: number }[]) => void;
  onReviewSection?: (cardId: string, sectionId: string, grade: number) => void;
}

/** Compute average stability for a set of cards */
function computeAvgStability(cards: { sections: { stability: number }[] }[]): number {
  let total = 0;
  let count = 0;
  for (const card of cards) {
    for (const s of card.sections) {
      if (s.stability > 0) {
        total += s.stability;
        count++;
      }
    }
  }
  return count > 0 ? total / count : 0;
}

export const MonumentInterior = memo(function MonumentInterior({
  monument,
  sources,
  onBack,
  onUpdateChapters,
  onReviewSection,
}: Props) {
  const { cards } = useCardContext();
  const navigate = useNavigate();
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  const allCards = useMemo(() => Object.values(cards), [cards]);
  const catCards = useMemo(
    () => allCards.filter((c) => c.category === monument.category),
    [allCards, monument.category],
  );

  const sourceHierarchy = useSourceHierarchy(allCards, sources, monument.category);

  // Build fallback tree from subcategories if no source links
  const fallbackTree = useMemo<HierarchyNode[]>(() => {
    if (sourceHierarchy.hasSourceLinks) return [];
    const bySubcat = new Map<string, typeof catCards>();
    for (const card of catCards) {
      const sub = card.subcategory || "Ostalo";
      if (!bySubcat.has(sub)) bySubcat.set(sub, []);
      bySubcat.get(sub)!.push(card);
    }
    const nodes: HierarchyNode[] = [];
    for (const [name, subCards] of bySubcat) {
      const levels = [0, 0, 0, 0, 0, 0];
      for (const c of subCards) levels[getCardMasteryLevel(c)]++;
      nodes.push({
        name,
        cardCount: subCards.length,
        levels,
        children: [],
      });
    }
    nodes.sort((a, b) => b.cardCount - a.cardCount);
    return nodes;
  }, [catCards, sourceHierarchy.hasSourceLinks]);

  const tree = sourceHierarchy.hasSourceLinks ? sourceHierarchy.tree : fallbackTree;
  const mode = sourceHierarchy.hasSourceLinks ? sourceHierarchy.mode : "B";

  const overdueCount = useMemo(() => {
    const now = Date.now();
    return catCards.filter((c: any) =>
      c.sections.some((s: any) => s.nextReview && s.nextReview <= now),
    ).length;
  }, [catCards]);

  // If drilled into a subcategory, show MentalSkeleton
  if (selectedSub && onUpdateChapters && onReviewSection) {
    return (
      <motion.div
        key="detail"
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -60 }}
        transition={{ duration: 0.25 }}
        className="space-y-3"
      >
        <Suspense fallback={<TabSkeleton />}>
          <MentalSkeleton
            cards={allCards}
            category={monument.category}
            subcategory={selectedSub}
            onBack={() => setSelectedSub(null)}
            onUpdateChapters={onUpdateChapters}
            onReviewSection={onReviewSection}
          />
        </Suspense>
      </motion.div>
    );
  }

  const materialIcon = MATERIAL_ICONS[monument.material];
  const modeLabel = mode === "A" ? "po izvoru" : "po potkategoriji";

  return (
    <motion.div
      key="interior"
      layoutId={`monument-${monument.category}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="glass-card p-5 border-gold/20">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-secondary transition-colors shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>

          <div className="shrink-0 h-16 w-16 flex items-center justify-center">
            <MonumentSVG buildingType={monument.buildingType} tier={monument.material} />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold font-display text-gold truncate">
              {materialIcon} {monument.category}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {catCards.length} kartica • {tree.length} {mode === "A" ? "izvora" : "grupa"} ({modeLabel}) • Dominatio {monument.mastery}%
            </p>
          </div>

          {overdueCount > 0 && (
            <Button
              size="sm"
              onClick={() => navigate(`/review?category=${encodeURIComponent(monument.category)}`)}
              className="gap-1.5 bg-gold hover:bg-gold/90 text-gold-foreground font-display shrink-0"
            >
              <Play className="h-3.5 w-3.5" />
              {overdueCount}
            </Button>
          )}
        </div>

        {/* Source Breakdown */}
        {monument.sources && monument.sources.length > 1 && (
          <SourceBreakdown sources={monument.sources} />
        )}
      </div>

      {/* Interior: Architectural nodes */}
      <ScrollArea className="max-h-[calc(100vh-280px)]">
        {mode === "A" ? (
          <div className="space-y-6">
            {tree.map((wing, wi) => (
              <div key={wing.name} className="space-y-3">
                <div className="flex items-center gap-3 px-2">
                  <div className="h-px flex-1 bg-gold/20" />
                  <h3 className="text-xs font-display text-gold uppercase tracking-widest shrink-0">
                    {wing.name}
                  </h3>
                  <div className="h-px flex-1 bg-gold/20" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {wing.children.map((child, ci) => (
                    <ArchNode
                      key={child.name}
                      name={child.name}
                      cardCount={child.cardCount}
                      levels={child.levels}
                      avgStability={computeAvgStability(child.cards)}
                      index={wi * 10 + ci}
                      onClick={() => setSelectedSub(child.name)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tree.map((node, i) => {
              const nodeCards = catCards.filter(
                (c: any) => (c.subcategory || "Ostalo") === node.name,
              );
              return (
                <ArchNode
                  key={node.name}
                  name={node.name}
                  cardCount={node.cardCount}
                  levels={node.levels}
                  avgStability={computeAvgStability(nodeCards)}
                  index={i}
                  onClick={() => setSelectedSub(node.name)}
                />
              );
            })}
          </div>
        )}

        {tree.length === 0 && (
          <div className="flex items-center justify-center min-h-[20vh]">
            <p className="text-sm text-muted-foreground italic font-display">
              Nulla structura in hoc monumento.
            </p>
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
});
