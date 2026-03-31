import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCardContext } from "@/contexts/AppContext";
import type { Monument } from "@/lib/forum-logic";
import { PHASE_LABELS } from "@/lib/forum-logic";
import { MonumentSVG } from "./monument-buildings";
import { ArchNode } from "./ArchNode";
import { useSourceHierarchy, type HierarchyNode, type HierarchyLeaf } from "@/hooks/useSourceHierarchy";
import { getCardMasteryLevel, MASTERY_LEVELS } from "@/components/KnowledgeMap";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Source } from "@/lib/db";
import type { Card } from "@/lib/spaced-repetition";

interface Props {
  monument: Monument;
  sources: Source[];
  onBack: () => void;
}

export const MonumentInterior = memo(function MonumentInterior({
  monument, sources, onBack,
}: Props) {
  const { cards } = useCardContext();
  const navigate = useNavigate();
  const [expandedSub, setExpandedSub] = useState<string | null>(null);
  const [expandedChap, setExpandedChap] = useState<string | null>(null);

  const catCards = useMemo(() => cards.filter((c) => c.categoryId === monument.category), [cards, monument.category]);

  const sourceHierarchy = useSourceHierarchy(cards, sources, monument.category);

  const fallbackTree = useMemo<HierarchyNode[]>(() => {
    if (sourceHierarchy.hasSourceLinks) return [];
    const bySubcat = new Map<string, typeof catCards>();
    for (const card of catCards) {
      const sub = card.subcategoryId || card.subcategory || "Ostalo";
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

  const modeLabel = mode === "A" ? "po izvoru" : "po potkategoriji";

  // Find currently expanded subcategory node
  const expandedNode = expandedSub ? tree.find(n => n.name === expandedSub) : null;

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
            <h2 className="text-lg font-semibold text-foreground truncate tracking-wide">
              {monument.categoryName || monument.category}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
              {catCards.length} kartica · {tree.length} {mode === "A" ? "izvora" : "grupa"} ({modeLabel}) · {monument.mastery}%
            </p>
          </div>

          {overdueCount > 0 && (
            <Button
              size="sm"
              onClick={() => navigate(`/review?category=${encodeURIComponent(monument.category)}`)}
              className="gap-1.5 bg-gold hover:bg-gold/90 text-gold-foreground shrink-0"
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

      {/* Breadcrumb when drilled in */}
      {expandedSub && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
          <button onClick={() => { setExpandedSub(null); setExpandedChap(null); }} className="hover:text-foreground transition-colors">
            Sve grupe
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground font-medium truncate">{expandedSub}</span>
          {expandedChap && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium truncate">{expandedChap}</span>
            </>
          )}
        </div>
      )}

      {/* Body */}
      <ScrollArea className="max-h-[calc(100vh-260px)]">
        <AnimatePresence mode="wait">
          {!expandedSub ? (
            /* Level 1: Subcategory grid */
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {tree.map((node, i) => (
                <ArchNode
                  key={node.name}
                  name={node.name}
                  cardCount={node.cardCount}
                  levels={node.levels}
                  avgStability={node.avgStability}
                  index={i}
                  onClick={() => { setExpandedSub(node.name); setExpandedChap(null); }}
                />
              ))}
            </motion.div>
          ) : expandedNode && !expandedChap ? (
            /* Level 2: Chapters within subcategory */
            <motion.div
              key={`sub-${expandedSub}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              {expandedNode.children.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {expandedNode.children.map((child, i) => (
                    <ArchNode
                      key={child.name}
                      name={child.name}
                      cardCount={child.cardCount}
                      levels={child.levels}
                      avgStability={child.avgStability}
                      index={i}
                      onClick={() => setExpandedChap(child.name)}
                    />
                  ))}
                </div>
              ) : (
                /* No chapters — show cards directly */
                <CardStrengthList cards={catCards.filter(c => (c.subcategoryId || c.subcategory || "Ostalo") === expandedSub)} />
              )}
            </motion.div>
          ) : expandedNode && expandedChap ? (
            /* Level 3: Individual cards within chapter */
            <motion.div
              key={`chap-${expandedChap}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
            >
              <CardStrengthList
                cards={
                  expandedNode.children.find(c => c.name === expandedChap)?.cards
                  ?? catCards.filter(c => (c.subcategory || "Ostalo") === expandedSub && (c.chapter || "Ostalo") === expandedChap)
                }
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {tree.length === 0 && (
          <div className="flex items-center justify-center min-h-[20vh]">
            <p className="text-sm text-muted-foreground italic">Nema strukture u ovom monumentu.</p>
          </div>
        )}
      </ScrollArea>
    </motion.div>
  );
});

// ─── Card Strength List ─────────────────────────────────

function CardStrengthList({ cards }: { cards: Card[] }) {
  const sorted = useMemo(() =>
    [...cards].sort((a, b) => getCardMasteryLevel(a) - getCardMasteryLevel(b)),
    [cards]
  );

  if (sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-sm text-muted-foreground italic">Nema kartica.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sorted.map(card => {
        const level = getCardMasteryLevel(card);
        const mastery = MASTERY_LEVELS[level] ?? MASTERY_LEVELS[0];
        const sections = card.sections ?? [];
        const avgStab = sections.length > 0
          ? sections.reduce((s, sec) => s + (sec.stability ?? 0), 0) / sections.length
          : 0;
        const avgDiff = sections.length > 0
          ? sections.reduce((s, sec) => s + (sec.difficulty ?? 5), 0) / sections.length
          : 5;

        return (
          <div
            key={card.id}
            className="glass-card p-3 flex items-center gap-3"
          >
            {/* Mastery dot */}
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: mastery.color }}
              title={mastery.label}
            />

            {/* Question text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground truncate">
                {card.question || "Bez pitanja"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {sections.length} {sections.length === 1 ? "sekcija" : "sekcija"} · {mastery.label}
              </p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums shrink-0">
              <span title="Prosječna stabilnost">S̄ {avgStab.toFixed(1)}d</span>
              <span title="Prosječna težina">D̄ {avgDiff.toFixed(1)}</span>
              {(card as any).errorLog?.length > 0 && (
                <span className="text-destructive" title="Greške">⚠ {(card as any).errorLog.length}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Source Breakdown ────────────────────────────────────

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
        <span className="uppercase tracking-wider text-[10px]">Izvori</span>
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
