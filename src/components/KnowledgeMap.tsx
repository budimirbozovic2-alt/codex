import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { Card, SectionState } from "@/lib/spaced-repetition";
import type { Source } from "@/lib/db";
import { motion } from "framer-motion";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import { loadSources } from "@/lib/sources-storage";
import CategoryList from "./knowledge-map/CategoryList";
import SubcategoryList from "./knowledge-map/SubcategoryList";

const MentalSkeleton = lazy(() => import("@/components/MentalSkeleton"));

interface Props {
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  onUpdateChapters?: (updates: { id: string; chapter: string; chapterOrder: number }[]) => void;
  onReviewSection?: (cardId: string, sectionId: string, grade: number) => void;
  onReorderCategories?: (ordered: string[]) => void;
  onReorderSubcategories?: (category: string, ordered: string[]) => void;
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

// Smart cache keyed by card.id + updatedAt for immutable-friendly caching
const _masteryCache = new Map<string, { level: number; updatedAt: number }>();

export function getCardMasteryLevel(card: Card): number {
  if (!card.sections || card.sections.length === 0) return 0;

  const cardUpdated = card.updatedAt ?? 0;
  const cached = _masteryCache.get(card.id);
  if (cached && cached.updatedAt === cardUpdated && cardUpdated !== 0) return cached.level;

  const errorCount = card.errorLog?.reduce((sum, e) => sum + e.count, 0) || 0;
  const allNew = card.sections.every((s) => s.state === SectionState.New);
  if (allNew) { _masteryCache.set(card.id, { level: 0, updatedAt: cardUpdated }); return 0; }

  const avgStability = card.sections.reduce((sum, s) => sum + s.stability, 0) / card.sections.length;

  let level: number;
  if (errorCount > 3 || avgStability < 3) level = 1;
  else if (errorCount > 0 && avgStability < 7) level = 2;
  else {
    const avgDifficulty = card.sections.reduce((sum, s) => sum + s.difficulty, 0) / card.sections.length;
    if (avgStability < 15 || avgDifficulty >= 6) level = 3;
    else if (avgStability <= 30) level = 4;
    else level = 5;
  }
  _masteryCache.set(card.id, { level, updatedAt: cardUpdated });
  return level;
}

export function getMasteryColor(level: number): string {
  return MASTERY_LEVELS[level]?.color || MASTERY_LEVELS[0].color;
}

type ViewState =
  | { step: "categories" }
  | { step: "subcategories"; category: string }
  | { step: "detail"; category: string; subcategory: string };

const NAV_CAT_KEY = "codex-nav-category";
const NAV_SUB_KEY = "codex-nav-subcategory";

function hydrateView(categories: string[], subcategories: Record<string, string[]>): ViewState {
  try {
    const cat = localStorage.getItem(NAV_CAT_KEY);
    const sub = localStorage.getItem(NAV_SUB_KEY);
    if (cat && categories.includes(cat)) {
      if (sub && (subcategories[cat] || []).includes(sub)) {
        return { step: "detail", category: cat, subcategory: sub };
      }
      return { step: "subcategories", category: cat };
    }
  } catch { /* ignore */ }
  return { step: "categories" };
}

function persistNav(next: ViewState) {
  try {
    if (next.step === "categories") {
      localStorage.removeItem(NAV_CAT_KEY);
      localStorage.removeItem(NAV_SUB_KEY);
    } else if (next.step === "subcategories") {
      localStorage.setItem(NAV_CAT_KEY, next.category);
      localStorage.removeItem(NAV_SUB_KEY);
    } else {
      localStorage.setItem(NAV_CAT_KEY, next.category);
      localStorage.setItem(NAV_SUB_KEY, next.subcategory);
    }
  } catch { /* ignore */ }
}

export default function KnowledgeMap({
  cards, categories, subcategories, onUpdateChapters, onReviewSection,
  onReorderCategories, onReorderSubcategories,
}: Props) {
  const [view, setView] = useState<ViewState>(() => hydrateView(categories, subcategories));
  const [searchQuery, setSearchQuery] = useState("");
  const [reorderMode, setReorderMode] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const directionRef = useRef(1);

  useEffect(() => {
    loadSources().then(setSources);
  }, []);

  const navigate = (next: ViewState) => {
    const stepOrder = { categories: 0, subcategories: 1, detail: 2 };
    directionRef.current = stepOrder[next.step] > stepOrder[view.step] ? 1 : -1;
    setSearchQuery("");
    setReorderMode(false);
    persistNav(next);
    setView(next);
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
  };

  const transition = { type: "tween" as const, duration: 0.25, ease: "easeInOut" as const };

  // ── Step 3: Detail view ──
  if (view.step === "detail" && onUpdateChapters && onReviewSection) {
    return (
      <motion.div
        key="detail"
        custom={directionRef.current}
        variants={slideVariants}
        initial="enter"
        animate="center"
        transition={transition}
        className="space-y-3"
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
    return (
      <SubcategoryList
        cards={cards}
        sources={sources}
        category={view.category}
        subcategories={subcategories}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        reorderMode={reorderMode}
        onToggleReorder={onReorderSubcategories ? () => setReorderMode(r => !r) : undefined}
        onBack={() => navigate({ step: "categories" })}
        onSelectSubcategory={(sub) => {
          if (onUpdateChapters && onReviewSection) {
            navigate({ step: "detail", category: view.category, subcategory: sub });
          }
        }}
        onReorderSubcategories={onReorderSubcategories}
        slideVariants={slideVariants}
        direction={directionRef.current}
        transition={transition}
      />
    );
  }

  // ── Step 1: Category list ──
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
      <CategoryList
        cards={cards}
        categories={categories}
        subcategories={subcategories}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        reorderMode={reorderMode}
        onToggleReorder={onReorderCategories ? () => setReorderMode(r => !r) : undefined}
        onBack={onBack}
        onSelectCategory={(cat) => navigate({ step: "subcategories", category: cat })}
        onReorderCategories={onReorderCategories}
      />
    </motion.div>
  );
}
