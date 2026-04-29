import { Target, Shield, Zap, BookOpen, ArrowLeft, Play, X as XIcon, HelpCircle, RotateCcw, Lock, ChevronDown, SlidersHorizontal, Info } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, getDueSections, SRSettings, SectionState, getRetrievability, isLeech } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import SessionFilters from "@/components/SessionFilters";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import OnboardingModal, { hasSeenOnboarding } from "@/components/OnboardingModal";
import { DueItem, ReviewMode, REVIEW_ONBOARDING_KEY, REVIEW_SLIDES } from "./review-constants";
import type { CategoryRecord } from "@/lib/db";
import InfoPanel from "@/components/InfoPanel";

interface ReviewSetupProps {
  dueCards: Card[];
  allCards: Card[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
  srSettings: SRSettings;
  onSelectMode: (mode: ReviewMode, category: string | null, subcategory: string | null, chapter: string | null, examFrequent: boolean, filterType: "all" | "essay" | "flash", items: DueItem[]) => void;
  onBack: () => void;
  savedSession: { mode: ReviewMode; selectedCategory?: string | null } | null;
  onResumeSession: () => void;
  onClearSavedSession: () => void;
  preSelectedCategory?: string | null;
  /** Hard scope lock: when set, category cannot be changed via UI. */
  lockedCategory?: string | null;
}

type ModeKey = Exclude<ReviewMode, null>;

interface ModeDef {
  key: ModeKey;
  icon: typeof Target;
  label: string;
  sublabel: string;
  desc: string;
  tone: "primary" | "warning" | "destructive";
}

const MODE_DEFS: ModeDef[] = [
  {
    key: "stabilization",
    icon: Target,
    label: "Fokusirano utvrđivanje",
    sublabel: "Stabilizacija",
    desc: "Cilja svježe i nedavno pogrešene kartice za brzo prebacivanje u dugoročnu memoriju.",
    tone: "primary",
  },
  {
    key: "critical",
    icon: Shield,
    label: "Kritični pregled",
    sublabel: "Zadržavanje",
    desc: "Hvata kartice u idealnom trenutku zaborava (R ≈ 80–85%).",
    tone: "warning",
  },
  {
    key: "hardest",
    icon: Zap,
    label: "Najteža pitanja",
    sublabel: "Okršaj",
    desc: "Do 50 statistički najzahtjevnijih kartica — leech i visoka težina.",
    tone: "destructive",
  },
];

const TONE_CLASSES: Record<ModeDef["tone"], { ring: string; iconBg: string; iconText: string; badge: string }> = {
  primary: {
    ring: "border-primary ring-1 ring-primary/40",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    badge: "bg-primary/10 text-primary",
  },
  warning: {
    ring: "border-warning ring-1 ring-warning/40",
    iconBg: "bg-warning/10",
    iconText: "text-warning",
    badge: "bg-warning/10 text-warning",
  },
  destructive: {
    ring: "border-destructive ring-1 ring-destructive/40",
    iconBg: "bg-destructive/10",
    iconText: "text-destructive",
    badge: "bg-destructive/10 text-destructive",
  },
};

const MODE_LABELS: Record<string, string> = {
  stabilization: "Fokusirano utvrđivanje",
  critical: "Kritični pregled",
  hardest: "Najteža pitanja",
};

export default function ReviewSetup({
  dueCards, allCards, categoryRecords, subcategories, srSettings,
  onSelectMode, onBack, savedSession, onResumeSession, onClearSavedSession,
  preSelectedCategory, lockedCategory,
}: ReviewSetupProps) {
  const [mode, setMode] = useState<ModeKey>("critical");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(lockedCategory ?? preSelectedCategory ?? null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [filterExamFrequent, setFilterExamFrequent] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding(REVIEW_ONBOARDING_KEY));

  // Stabilization is FSRS-driven: sub/chapter narrowing would compromise the
  // due-priority selection, so we proactively clear them when entering this mode.
  useEffect(() => {
    if (mode === "stabilization") {
      if (selectedSubcategory !== null) setSelectedSubcategory(null);
      if (selectedChapter !== null) setSelectedChapter(null);
    }
  }, [mode, selectedSubcategory, selectedChapter]);

  const dueCategories = useMemo(() => {
    const cats = new Set(dueCards.map((c) => c.categoryId));
    return Array.from(cats).sort();
  }, [dueCards]);

  const filteredDueCards = useMemo(() => {
    let filtered = dueCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.categoryId === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategoryId === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter((c) => c.chapterId === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("često-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter((c) => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter((c) => c.type === "flash");
    return filtered;
  }, [dueCards, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType]);

  const filteredAllCards = useMemo(() => {
    let filtered = allCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.categoryId === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategoryId === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter((c) => c.chapterId === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("često-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter((c) => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter((c) => c.type === "flash");
    return filtered;
  }, [allCards, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType]);

  // Stabilization MUST follow FSRS-due ordering across the full (locked) scope.
  // It intentionally ignores subcategory / chapter filters so the mechanism
  // is not undermined by manual scope narrowing. Type + exam-frequent honored.
  const stabilizationSourceCards = useMemo(() => {
    let filtered = dueCards;
    if (lockedCategory) filtered = filtered.filter((c) => c.categoryId === lockedCategory);
    else if (selectedCategory) filtered = filtered.filter((c) => c.categoryId === selectedCategory);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("često-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter((c) => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter((c) => c.type === "flash");
    return filtered;
  }, [dueCards, lockedCategory, selectedCategory, filterExamFrequent, filterType]);

  const stabilizationItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    stabilizationSourceCards.forEach((card) => {
      getDueSections(card).forEach((section) => {
        if (
          (section.state === SectionState.Learning || section.state === SectionState.Relearning) &&
          section.stability < 5
        ) {
          items.push({ card, section });
        }
      });
    });
    items.sort((a, b) => a.section.stability - b.section.stability);
    return items;
  }, [stabilizationSourceCards]);

  const criticalItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    filteredAllCards.forEach((card) => {
      card.sections.forEach((section) => {
        if (section.state === SectionState.New) return;
        const r = getRetrievability(section);
        if (r >= 80 && r <= 85) {
          items.push({ card, section });
        }
      });
    });
    items.sort((a, b) => getRetrievability(a.section) - getRetrievability(b.section));
    return items;
  }, [filteredAllCards]);

  const hardestItems = useMemo<DueItem[]>(() => {
    const leechItems: DueItem[] = [];
    const highDiffItems: DueItem[] = [];

    filteredAllCards.forEach((card) => {
      card.sections.forEach((section) => {
        if (section.state === SectionState.New) return;
        if (isLeech(section, srSettings)) {
          leechItems.push({ card, section });
        } else if (section.difficulty > 7) {
          highDiffItems.push({ card, section });
        }
      });
    });

    highDiffItems.sort((a, b) => b.section.difficulty - a.section.difficulty);
    const combined = [...leechItems];
    const remaining = 50 - combined.length;
    if (remaining > 0) combined.push(...highDiffItems.slice(0, remaining));
    return combined.slice(0, 50);
  }, [filteredAllCards, srSettings]);

  const examFrequentCount = useMemo(() => {
    return dueCards.filter(c => c.tags?.includes("često-na-ispitu")).length;
  }, [dueCards]);

  const subPosMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of categoryRecords) {
      (r.subcategories || []).forEach((sub, i: number) => {
        const id = typeof sub === "string" ? sub : sub.id;
        const pos = typeof sub === "string" ? i : (sub.sortOrder ?? i);
        m[id] = pos;
      });
    }
    return m;
  }, [categoryRecords]);

  const chapPosMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of categoryRecords) {
      for (const sub of r.subcategories || []) {
        if (typeof sub === "string") continue;
        (sub.chapters || []).forEach((ch, i: number) => {
          const id = typeof ch === "string" ? ch : ch.id;
          const pos = typeof ch === "string" ? i : (ch.sortOrder ?? i);
          m[id] = pos;
        });
      }
    }
    return m;
  }, [categoryRecords]);

  const dueSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    const subs = new Set(dueCards.filter((c) => c.categoryId === selectedCategory && c.subcategoryId).map((c) => c.subcategoryId!));
    return Array.from(subs).sort((a, b) => (subPosMap[a] ?? 999) - (subPosMap[b] ?? 999));
  }, [dueCards, selectedCategory, subPosMap]);

  const dueChapters = useMemo(() => {
    if (!selectedSubcategory) return [];
    const chapters = new Set(dueCards.filter(c => c.categoryId === selectedCategory && c.subcategoryId === selectedSubcategory && c.chapterId).map(c => c.chapterId!));
    return Array.from(chapters).sort((a, b) => (chapPosMap[a] ?? 999) - (chapPosMap[b] ?? 999));
  }, [dueCards, selectedCategory, selectedSubcategory, chapPosMap]);

  const counts: Record<ModeKey, number> = {
    stabilization: stabilizationItems.length,
    critical: criticalItems.length,
    hardest: hardestItems.length,
  };

  const itemsByMode: Record<ModeKey, DueItem[]> = {
    stabilization: stabilizationItems,
    critical: criticalItems,
    hardest: hardestItems,
  };

  const lockedCategoryName = useMemo(() => {
    if (!lockedCategory) return null;
    return categoryRecords.find(r => r.id === lockedCategory)?.name ?? null;
  }, [lockedCategory, categoryRecords]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filterType === "essay") parts.push("Samo eseji");
    else if (filterType === "flash") parts.push("Samo blic");
    if (selectedSubcategory) parts.push("Subkategorija");
    if (selectedChapter) parts.push("Poglavlje");
    if (filterExamFrequent) parts.push("Često na ispitu");
    return parts.length ? parts.join(" · ") : "Svi sadržaji";
  }, [filterType, selectedSubcategory, selectedChapter, filterExamFrequent]);

  const handleStartSession = useCallback(() => {
    onSelectMode(mode, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType, itemsByMode[mode]);
  }, [mode, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType, onSelectMode, itemsByMode]);

  const totalForMode = counts[mode];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-3xl mx-auto space-y-6 py-10">
      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal
            slides={REVIEW_SLIDES}
            storageKey={REVIEW_ONBOARDING_KEY}
            onComplete={() => setShowOnboarding(false)}
            finishLabel="Razumijem"
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center gap-1">
          <InfoPanel title="Konsolidacija">
            <p><strong>Fokusirano utvrđivanje</strong> — cilja nove i nedavno pogrešene kartice za brzu stabilizaciju.</p>
            <p><strong>Kritični pregled</strong> — hvata kartice u idealnom trenutku zaborava (R ≈ 80–85%).</p>
            <p><strong>Najteža pitanja</strong> — okršaj sa do 50 statistički najzahtjevnijih kartica.</p>
            <p>Svi rezultati se upisuju u FSRS algoritam za optimalno zakazivanje ponavljanja.</p>
          </InfoPanel>
          <button
            onClick={() => setShowOnboarding(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-secondary"
            title="Vodič kroz konsolidaciju"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Onboarding</span>
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <RotateCcw className="h-6 w-6 text-primary" /> Konsolidacija znanja
        </h2>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Izaberi pristup ponavljanju za ovu sesiju.
        </p>
      </div>

      {/* Locked subject pill */}
      {lockedCategory && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20 text-xs">
          <Lock className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-foreground">
            Predmet:&nbsp;<strong>{lockedCategoryName ?? "—"}</strong>
          </span>
        </div>
      )}

      {/* Resume saved session */}
      {savedSession && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3"
        >
          <Play className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Nastavi prethodnu sesiju</p>
            <p className="text-xs text-muted-foreground truncate">
              Mod: {MODE_LABELS[savedSession.mode ?? ""] || savedSession.mode}
            </p>
          </div>
          <Button size="sm" onClick={onResumeSession} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Play className="h-3.5 w-3.5 mr-1" /> Nastavi
          </Button>
          <button onClick={onClearSavedSession} className="text-muted-foreground hover:text-foreground p-1" aria-label="Odbaci sačuvanu sesiju">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </motion.div>
      )}

      {/* Mode cards (radio-style) */}
      <div className="space-y-3" role="radiogroup" aria-label="Režim konsolidacije">
        {MODE_DEFS.map(({ key, icon: Icon, label, sublabel, desc, tone }) => {
          const count = counts[key];
          const selected = mode === key;
          const disabled = count === 0;
          const tc = TONE_CLASSES[tone];
          return (
            <button
              key={key}
              role="radio"
              aria-checked={selected}
              onClick={() => !disabled && setMode(key)}
              disabled={disabled}
              className={`w-full text-left rounded-xl border bg-card p-5 transition-all ${
                selected ? tc.ring : "border-border hover:border-foreground/20"
              } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-accent/30"}`}
            >
              <div className="flex items-center gap-4">
                <div className={`p-2.5 rounded-lg ${tc.iconBg} ${tc.iconText} shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-medium">{label}</h3>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{sublabel}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 leading-snug">{desc}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${tc.badge}`}>
                  {count} sekcija
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters (collapsible) */}
      <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border bg-card hover:bg-accent/30 transition-colors text-sm">
          <span className="flex items-center gap-2 text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filteri:</span>
            <span className="text-foreground">{filterSummary}</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <SessionFilters
            layoutPrefix="review"
            cards={dueCards}
            categories={dueCategories}
            categoryRecords={categoryRecords}
            subcategories={subcategories}
            selectedCategory={selectedCategory}
            selectedSubcategory={selectedSubcategory}
            selectedChapter={selectedChapter}
            filterExamFrequent={filterExamFrequent}
            examFrequentCount={examFrequentCount}
            filterType={filterType}
            lockedCategory={lockedCategory}
            onSelectCategory={(cat) => {
              if (lockedCategory) return;
              setSelectedCategory(cat);
              setSelectedSubcategory(null);
              setSelectedChapter(null);
            }}
            onSelectSubcategory={(sub) => { setSelectedSubcategory(sub); setSelectedChapter(null); }}
            onSelectChapter={setSelectedChapter}
            onToggleExamFrequent={() => setFilterExamFrequent(!filterExamFrequent)}
            onFilterTypeChange={setFilterType}
          />
        </CollapsibleContent>
      </Collapsible>

      {/* Start CTA */}
      <Button
        onClick={handleStartSession}
        className="w-full py-6 text-base"
        disabled={totalForMode === 0}
      >
        <BookOpen className="h-4 w-4 mr-2" />
        Počni konsolidaciju ({totalForMode} sekcija)
      </Button>
    </motion.div>
  );
}
