import { memo, useMemo, useState, lazy, Suspense } from "react";
import { motion } from "framer-motion";
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

export const MonumentInterior = memo(function MonumentInterior({
  monument, sources, onBack, onUpdateChapters, onReviewSection,
}: Props) {
  const { cards } = useCardContext();
  const navigate = useNavigate();
  const [selectedSub, setSelectedSub] = useState<string | null>(null);

  const allCards = useMemo(() => Object.values(cards), [cards]);
  const catCards = useMemo(() => allCards.filter((c) => c.category === monument.category), [allCards, monument.category]);

  const sourceHierarchy = useSourceHierarchy(allCards, sources, monument.category);

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
      let stabTotal = 0, stabCount = 0;
      for (const c of subCards) for (const s of (c as any).sections ?? []) if ((s.stability ?? 0) > 0) { stabTotal += s.stability; stabCount++; }
      nodes.push({ name, cardCount: subCards.length, levels, avgStability: stabCount > 0 ? stabTotal / stabCount : 0, children: [] });
    }
    nodes.sort((a, b) => b.cardCount - a.cardCount);
    return nodes;
  }, [catCards, sourceHierarchy.hasSourceLinks]);

  const tree = sourceHierarchy.hasSourceLinks ? sourceHierarchy.tree : fallbackTree;
  const mode = sourceHierarchy.hasSourceLinks ? sourceHierarchy.mode : "B";

  const overdueCount = useMemo(() => {
    const now = Date.now();
    return catCards.filter((c: any) => c.sections.some((s: any) => s.nextReview && s.nextReview <= now)).length;
  }, [catCards]);

  if (selectedSub && onUpdateChapters && onReviewSection) {
    return (
      <motion.div key="detail" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.2 }} className="space-y-3">
        <Suspense fallback={<TabSkeleton />}>
          <MentalSkeleton cards={allCards} category={monument.category} subcategory={selectedSub} onBack={() => setSelectedSub(null)} onUpdateChapters={onUpdateChapters} onReviewSection={onReviewSection} />
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="glass-card p-5" style={{ borderColor: "hsl(var(--gold) / 0.15)" }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary transition-colors shrink-0">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>

          <div className="shrink-0 h-14 w-14 flex items-center justify-center opacity-80">
            <MonumentSVG buildingType={monument.buildingType} tier={monument.material} />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold font-display text-foreground truncate tracking-wide">
              {materialIcon} {monument.category}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {catCards.length} kartica · {tree.length} {mode === "A" ? "izvora" : "grupa"} ({modeLabel}) · {monument.mastery}%
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

        {monument.sources && monument.sources.length > 1 && (
          <SourceBreakdown sources={monument.sources} />
        )}
      </div>

      {/* Body */}
      <ScrollArea className="max-h-[calc(100vh-260px)]">
        {mode === "A" ? (
          <div className="space-y-6">
            {tree.map((wing, wi) => (
              <div key={wing.name} className="space-y-3">
                {/* Wing divider */}
                <div className="flex items-center gap-3 px-1">
                  <div className="h-px flex-1 bg-border/40" />
                  <span className="text-[10px] font-display text-muted-foreground uppercase tracking-[0.15em] shrink-0">
                    {wing.name}
                  </span>
                  <div className="h-px flex-1 bg-border/40" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {wing.children.map((child, ci) => (
                    <ArchNode key={child.name} name={child.name} cardCount={child.cardCount} levels={child.levels} avgStability={child.avgStability} index={wi * 10 + ci} onClick={() => setSelectedSub(child.name)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tree.map((node, i) => (
              <ArchNode key={node.name} name={node.name} cardCount={node.cardCount} levels={node.levels} avgStability={node.avgStability} index={i} onClick={() => setSelectedSub(node.name)} />
            ))}
          </div>
        )}
        {tree.length === 0 && (
          <div className="flex items-center justify-center min-h-[20vh]">
            <p className="text-sm text-muted-foreground italic">Nulla structura in hoc monumento.</p>
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
});

function SourceBreakdown({ sources }: { sources: import("@/lib/forum-logic").MonumentSourceBreakdown[] }) {
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => [...sources].sort((a, b) => b.mastery - a.mastery), [sources]);

  function tierColor(m: number) {
    if (m >= 95) return "hsl(var(--gold))";
    if (m >= 60) return "hsl(142, 60%, 45%)";
    if (m >= 30) return "hsl(45, 93%, 47%)";
    return "hsl(0, 72%, 51%)";
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3 pt-3 border-t border-border/30">
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
        <span className="font-display uppercase tracking-wider text-[10px]">Fontes</span>
        <span className="tabular-nums">({sorted.length})</span>
        <ChevronDown className={`h-3 w-3 ml-auto transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-1.5">
          {sorted.map((s) => (
            <div key={s.masterSource} className="flex items-center gap-2 text-xs">
              <span className="truncate flex-1 min-w-0 text-foreground">{s.masterSource}</span>
              <span className="tabular-nums text-muted-foreground shrink-0">{s.cardCount}</span>
              <div className="w-16 shrink-0">
                <Progress value={s.mastery} className="h-1" style={{ "--progress-color": tierColor(s.mastery) } as React.CSSProperties} />
              </div>
              <span className="tabular-nums w-8 text-right shrink-0" style={{ color: tierColor(s.mastery) }}>{s.mastery}%</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
