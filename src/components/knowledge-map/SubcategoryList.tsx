import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { Card } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/db";
import { getCardMasteryLevel } from "@/components/KnowledgeMap";
import { useSourceHierarchy } from "@/hooks/useSourceHierarchy";
import SubcategoryCard from "./SubcategoryCard";
import { Header, SearchBar, EmptyMessage } from "./SharedWidgets";

interface Props {
  cards: Card[];
  sources: Source[];
  category: string;
  subcategories: Record<string, string[]>;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  reorderMode: boolean;
  onToggleReorder?: () => void;
  onBack: () => void;
  onSelectSubcategory: (sub: string) => void;
  onReorderSubcategories?: (category: string, ordered: string[]) => void;
  slideVariants: any;
  direction: number;
  transition: any;
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

function SubcategoryListInner({
  cards, sources, category, subcategories, searchQuery, onSearchChange,
  reorderMode, onToggleReorder, onBack, onSelectSubcategory,
  onReorderSubcategories, slideVariants, direction, transition,
}: Props) {
  const catCards = cards.filter((c) => c.categoryId === category);
  const sourceHierarchy = useSourceHierarchy(cards, sources, category);

  const handleMoveSub = useCallback((index: number, dir: -1 | 1) => {
    if (!onReorderSubcategories) return;
    const subs = subcategories[category] || [];
    const newIndex = index + dir;
    if (newIndex < 0 || newIndex >= subs.length) return;
    onReorderSubcategories(category, moveItem(subs, index, newIndex));
  }, [onReorderSubcategories, subcategories, category]);

  // Source hierarchy mode
  if (sourceHierarchy.hasSourceLinks) {
    const { mode, tree } = sourceHierarchy;
    const q = searchQuery.toLowerCase();
    const filtered = q ? tree.filter((n) => n.name.toLowerCase().includes(q)) : tree;
    const modeLabel = mode === "A" ? "po izvoru" : "po potkategoriji";

    return (
      <motion.div
        key="subcategories-source"
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        transition={transition}
        className="space-y-6"
      >
        <Header
          title={category}
          subtitle={`${catCards.length} kartica • ${tree.length} grupa (${modeLabel})`}
          onBack={onBack}
        />
        <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="Pretraži..." />

        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(({ name, cardCount, levels }, i) => (
            <SubcategoryCard
              key={name}
              name={name}
              count={cardCount}
              levels={levels}
              index={i}
              realIndex={i}
              subsLength={tree.length}
              reorderMode={false}
              isOstalo={name === "Bez izvora" || name === "Ostalo"}
              onNavigate={() => onSelectSubcategory(name)}
              onMoveUp={() => {}}
              onMoveDown={() => {}}
            />
          ))}
        </div>

        {filtered.length === 0 && <EmptyMessage text={searchQuery ? "Nema rezultata pretrage" : "Nema podataka"} />}
      </motion.div>
    );
  }

  // Fallback: original subcategory system
  const subs = subcategories[category] || [];

  const subsWithStats = subs
    .map((sub) => {
      const subCards = catCards.filter((c) => (c.subcategoryId || c.subcategory) === sub);
      if (subCards.length === 0) return null;
      const levels = [0, 0, 0, 0, 0, 0];
      subCards.forEach((c) => levels[getCardMasteryLevel(c)]++);
      return { name: sub, count: subCards.length, levels };
    })
    .filter(Boolean) as { name: string; count: number; levels: number[] }[];

  const uncategorized = catCards.filter((c) => !(c.subcategoryId || c.subcategory) || !subs.includes((c.subcategoryId || c.subcategory)!));
  if (uncategorized.length > 0) {
    const levels = [0, 0, 0, 0, 0, 0];
    uncategorized.forEach((c) => levels[getCardMasteryLevel(c)]++);
    subsWithStats.push({ name: "Ostalo", count: uncategorized.length, levels });
  }

  const q = searchQuery.toLowerCase();
  const filtered = q ? subsWithStats.filter((s) => s.name.toLowerCase().includes(q)) : subsWithStats;

  return (
    <motion.div
      key="subcategories"
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      transition={transition}
      className="space-y-6"
    >
      <Header
        title={category}
        subtitle={`${catCards.length} kartica u ${subsWithStats.length} potkategorija`}
        onBack={onBack}
        reorderMode={reorderMode}
        onToggleReorder={onToggleReorder}
      />
      {!reorderMode && <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="Pretraži potkategorije..." />}

      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map(({ name, count, levels }, i) => {
          const realIndex = subs.indexOf(name);
          const isOstalo = name === "Ostalo";
          return (
            <SubcategoryCard
              key={name}
              name={name}
              count={count}
              levels={levels}
              index={i}
              realIndex={realIndex}
              subsLength={subs.length}
              reorderMode={reorderMode}
              isOstalo={isOstalo}
              onNavigate={() => !reorderMode && onSelectSubcategory(name)}
              onMoveUp={() => handleMoveSub(realIndex, -1)}
              onMoveDown={() => handleMoveSub(realIndex, 1)}
            />
          );
        })}
      </div>

      {filtered.length === 0 && <EmptyMessage text={searchQuery ? "Nema rezultata pretrage" : "Nema potkategorija"} />}
    </motion.div>
  );
}

const SubcategoryList = React.memo(SubcategoryListInner);
export default SubcategoryList;
