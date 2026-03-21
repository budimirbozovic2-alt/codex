import { useState, useMemo, useRef, lazy, Suspense } from "react";
import { Card, SectionState } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as ChevronRight } from "lucide-react/dist/esm/icons/chevron-right";
import { default as Search } from "lucide-react/dist/esm/icons/search";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as BarChart3 } from "lucide-react/dist/esm/icons/bar-chart-3";
import { default as HelpCircle } from "lucide-react/dist/esm/icons/help-circle";
import { TabSkeleton } from "@/components/ui/page-skeleton";

const MentalSkeleton = lazy(() => import("@/components/MentalSkeleton"));

interface Props {
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  onBack: () => void;
  onUpdateChapters?: (updates: { id: string; chapter: string; chapterOrder: number }[]) => void;
  onReviewSection?: (cardId: string, sectionId: string, grade: number) => void;
}

export interface MasteryLevel {
  level: number;
  label: string;
  color: string;
}

export const MASTERY_LEVELS: MasteryLevel[] = [
  { level: 0, label: "Novo", color: "hsl(220, 13%, 69%)" },
  { level: 1, label: "Kritično", color: "hsl(0, 72%, 51%)" },
  { level: 2, label: "Teško", color: "hsl(25, 95%, 53%)" },
  { level: 3, label: "Nesigurno", color: "hsl(45, 93%, 47%)" },
  { level: 4, label: "Stabilno", color: "hsl(142, 60%, 50%)" },
  { level: 5, label: "Savladano", color: "hsl(142, 60%, 30%)" },
];

export function getCardMasteryLevel(card: Card): number {
  const errorCount = card.errorLog?.reduce((sum, e) => sum + e.count, 0) || 0;
  const allNew = card.sections.every((s) => s.state === SectionState.New);
  if (allNew) return 0;

  const avgStability = card.sections.reduce((sum, s) => sum + s.stability, 0) / card.sections.length;

  if (errorCount > 3 || avgStability < 3) return 1;
  if (errorCount > 0 && avgStability < 7) return 2;

  const avgDifficulty = card.sections.reduce((sum, s) => sum + s.difficulty, 0) / card.sections.length;
  if (avgStability < 15 || avgDifficulty >= 6) return 3;
  if (avgStability <= 30) return 4;
  return 5;
}

export function getMasteryColor(level: number): string {
  return MASTERY_LEVELS[level]?.color || MASTERY_LEVELS[0].color;
}

type ViewState =
  | { step: "categories" }
  | { step: "subcategories"; category: string }
  | { step: "detail"; category: string; subcategory: string };

export default function KnowledgeMap({ cards, categories, subcategories, onBack, onUpdateChapters, onReviewSection }: Props) {
  const [view, setView] = useState<ViewState>({ step: "categories" });
  const [searchQuery, setSearchQuery] = useState("");
  const directionRef = useRef(1); // 1 = forward (drill down), -1 = back

  const navigate = (next: ViewState) => {
    const stepOrder = { categories: 0, subcategories: 1, detail: 2 };
    directionRef.current = stepOrder[next.step] > stepOrder[view.step] ? 1 : -1;
    setSearchQuery("");
    setView(next);
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  const transition = { type: "tween", duration: 0.25, ease: "easeInOut" };

  // ── Step 3: Detail view via MentalSkeleton ──
  if (view.step === "detail" && onUpdateChapters && onReviewSection) {
    return (
      <motion.div
        key="detail"
        custom={directionRef.current}
        variants={slideVariants}
        initial="enter"
        animate="center"
        transition={transition}
      >
        <Suspense fallback={<TabSkeleton />}>
          <MentalSkeleton
            cards={cards}
            category={view.category}
            subcategory={view.subcategory}
            onBack={() => navigate({ step: "subcategories", category: view.category })}
            onUpdateChapters={onUpdateChapters}
            onReviewSection={onReviewSection}
          />
        </Suspense>
      </motion.div>
    );
  }

  // ── Step 2: Subcategory list ──
  if (view.step === "subcategories") {
    const cat = view.category;
    const subs = subcategories[cat] || [];
    const catCards = cards.filter((c) => c.category === cat);

    const subsWithStats = subs
      .map((sub) => {
        const subCards = catCards.filter((c) => c.subcategory === sub);
        if (subCards.length === 0) return null;
        const levels = [0, 0, 0, 0, 0, 0];
        subCards.forEach((c) => levels[getCardMasteryLevel(c)]++);
        return { name: sub, count: subCards.length, levels };
      })
      .filter(Boolean) as { name: string; count: number; levels: number[] }[];

    const uncategorized = catCards.filter((c) => !c.subcategory || !subs.includes(c.subcategory));
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
        custom={directionRef.current}
        variants={slideVariants}
        initial="enter"
        animate="center"
        transition={transition}
        className="space-y-6"
      >
        <Header
          title={cat}
          subtitle={`${catCards.length} kartica u ${subsWithStats.length} potkategorija`}
          onBack={() => navigate({ step: "categories" })}
        />
        <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Pretraži potkategorije..." />

        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(({ name, count, levels }, i) => (
            <motion.button
              key={name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              onClick={() => {
                if (onUpdateChapters && onReviewSection) {
                  navigate({ step: "detail", category: cat, subcategory: name });
                }
              }}
              className="group flex items-center gap-4 p-4 rounded-xl border bg-card hover:bg-secondary/40 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{count} kartica</p>
                <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-secondary mt-2">
                  {levels.map((c, lvl) =>
                    c > 0 ? (
                      <div key={lvl} style={{ width: `${(c / count) * 100}%`, backgroundColor: getMasteryColor(lvl) }} />
                    ) : null
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </motion.button>
          ))}
        </div>

        {filtered.length === 0 && <EmptyMessage text={searchQuery ? "Nema rezultata pretrage" : "Nema potkategorija"} />}
      </motion.div>
    );
  }

  // ── Step 1: Category list ──
  const q = searchQuery.toLowerCase();

  const catsWithStats = categories
    .map((cat) => {
      const catCards = cards.filter((c) => c.category === cat);
      if (catCards.length === 0) return null;
      const subs = subcategories[cat] || [];
      const subCount = subs.filter((s) => catCards.some((c) => c.subcategory === s)).length;
      const levels = [0, 0, 0, 0, 0, 0];
      catCards.forEach((c) => levels[getCardMasteryLevel(c)]++);
      return { name: cat, cardCount: catCards.length, subCount, levels };
    })
    .filter(Boolean) as { name: string; cardCount: number; subCount: number; levels: number[] }[];

  const filteredCats = q ? catsWithStats.filter((c) => c.name.toLowerCase().includes(q)) : catsWithStats;

  return (
    <motion.div
      key="categories"
      custom={directionRef.current}
      variants={slideVariants}
      initial="enter"
      animate="center"
      transition={transition}
      className="space-y-6"
    >
      <Header title="Mapa Znanja" subtitle="Odaberi predmet za detaljan pregled" onBack={onBack} />
      <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Pretraži kategorije..." />

      {/* Legend */}
      <div className="flex flex-wrap gap-3 p-3 rounded-xl border bg-card">
        {MASTERY_LEVELS.map((ml) => (
          <div key={ml.level} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: ml.color }} />
            <span className="text-muted-foreground">{ml.label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredCats.map(({ name, cardCount, subCount, levels }, i) => (
          <motion.button
            key={name}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
            onClick={() => navigate({ step: "subcategories", category: name })}
            className="group flex flex-col gap-3 p-5 rounded-xl border bg-card hover:bg-secondary/40 transition-colors text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-serif text-base font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{cardCount} kartica • {subCount} potkategorija</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-secondary">
              {levels.map((c, lvl) =>
                c > 0 ? (
                  <div key={lvl} style={{ width: `${(c / cardCount) * 100}%`, backgroundColor: getMasteryColor(lvl) }} />
                ) : null
              )}
            </div>
          </motion.button>
        ))}
      </div>

      {filteredCats.length === 0 && <EmptyMessage text={searchQuery ? "Nema rezultata pretrage" : "Nema kartica za prikaz"} />}
    </motion.div>
  );
}

// ── Shared small components ──

function Header({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary transition-colors">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div>
        <h2 className="text-2xl font-serif">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-4 py-2.5 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function EmptyMessage({ text }: { text: string }) {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <HelpCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
      <p>{text}</p>
    </div>
  );
}
