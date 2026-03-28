import { ChevronRight, BarChart3, ArrowUp, ArrowDown } from "lucide-react";
import React, { useCallback } from "react";
import { motion } from "framer-motion";
import { MASTERY_LEVELS, getMasteryColor, getCardMasteryLevel } from "@/components/KnowledgeMap";
import { Card } from "@/lib/spaced-repetition";
import { Header, SearchBar, EmptyMessage } from "./SharedWidgets";

interface Props {
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  reorderMode: boolean;
  onToggleReorder?: () => void;
  onBack: () => void;
  onSelectCategory: (cat: string) => void;
  onReorderCategories?: (ordered: string[]) => void;
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const result = [...arr];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

function CategoryListInner({
  cards, categories, subcategories, searchQuery, onSearchChange,
  reorderMode, onToggleReorder, onBack, onSelectCategory, onReorderCategories,
}: Props) {
  const q = searchQuery.toLowerCase();

  const catsWithStats = categories
    .map((cat) => {
      const catCards = cards.filter((c) => c.categoryId === cat);
      if (catCards.length === 0) return null;
      const subs = subcategories[cat] || [];
      const subCount = subs.filter((s) => catCards.some((c) => c.subcategory === s)).length;
      const levels = [0, 0, 0, 0, 0, 0];
      catCards.forEach((c) => levels[getCardMasteryLevel(c)]++);
      return { name: cat, cardCount: catCards.length, subCount, levels };
    })
    .filter(Boolean) as { name: string; cardCount: number; subCount: number; levels: number[] }[];

  const filteredCats = q ? catsWithStats.filter((c) => c.name.toLowerCase().includes(q)) : catsWithStats;

  const handleMoveCat = useCallback((index: number, direction: -1 | 1) => {
    if (!onReorderCategories) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= categories.length) return;
    onReorderCategories(moveItem(categories, index, newIndex));
  }, [onReorderCategories, categories]);

  return (
    <>
      <Header
        title="Mapa Znanja"
        subtitle="Odaberi predmet za detaljan pregled"
        onBack={onBack}
        reorderMode={reorderMode}
        onToggleReorder={onToggleReorder}
      />
      {!reorderMode && <SearchBar value={searchQuery} onChange={onSearchChange} placeholder="Pretraži kategorije..." />}

      {/* Legend */}
      {!reorderMode && (
        <div className="flex flex-wrap gap-3 p-3 rounded-xl border bg-card">
          {MASTERY_LEVELS.map((ml) => (
            <div key={ml.level} className="flex items-center gap-1.5 text-xs">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: ml.color }} />
              <span className="text-muted-foreground">{ml.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className={`grid gap-3 ${reorderMode ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
        {filteredCats.map(({ name, cardCount, subCount, levels }, i) => {
          const realIndex = categories.indexOf(name);
          return (
            <motion.div
              key={name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.25 }}
              className="group flex items-center gap-2"
            >
              {reorderMode && (
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => handleMoveCat(realIndex, -1)}
                    disabled={realIndex <= 0}
                    className="p-1 rounded hover:bg-secondary disabled:opacity-20 transition-colors"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleMoveCat(realIndex, 1)}
                    disabled={realIndex >= categories.length - 1}
                    className="p-1 rounded hover:bg-secondary disabled:opacity-20 transition-colors"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
              )}
              <button
                onClick={() => !reorderMode && onSelectCategory(name)}
                className="flex-1 flex flex-col gap-3 p-5 rounded-xl border bg-card hover:bg-secondary/40 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">{cardCount} kartica • {subCount} potkategorija</p>
                    </div>
                  </div>
                  {!reorderMode && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
                <div className="flex h-2 w-full rounded-full overflow-hidden bg-secondary">
                  {levels.map((c, lvl) =>
                    c > 0 ? (
                      <div key={lvl} style={{ width: `${(c / cardCount) * 100}%`, backgroundColor: getMasteryColor(lvl) }} />
                    ) : null
                  )}
                </div>
              </button>
            </motion.div>
          );
        })}
      </div>

      {filteredCats.length === 0 && <EmptyMessage text={searchQuery ? "Nema rezultata pretrage" : "Nema kartica za prikaz"} />}
    </>
  );
}

const CategoryList = React.memo(CategoryListInner);
export default CategoryList;
