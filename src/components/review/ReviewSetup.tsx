import { Target, Shield, Zap, BookOpen, ArrowLeft, Play, X as XIcon, HelpCircle } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Card, getDueSections, SRSettings, SectionState, getRetrievability, isLeech } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import SessionFilters from "@/components/SessionFilters";
import { Button } from "@/components/ui/button";
import OnboardingModal, { hasSeenOnboarding } from "@/components/OnboardingModal";
import { DueItem, ReviewMode, REVIEW_ONBOARDING_KEY, REVIEW_SLIDES } from "./review-constants";
function HowItWorksCorner({ onShowOnboarding }: { onShowOnboarding: () => void }) {
  return (
    <div className="absolute top-0 right-0">
      <button
        onClick={onShowOnboarding}
        className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        title="Vodič kroz konsolidaciju"
      >
        <HelpCircle className="h-5 w-5" />
      </button>
    </div>
  );
}

interface ReviewSetupProps {
  dueCards: Card[];
  allCards: Card[];
  subcategories: Record<string, string[]>;
  srSettings: SRSettings;
  onSelectMode: (mode: ReviewMode, category: string | null, subcategory: string | null, chapter: string | null, examFrequent: boolean, filterType: "all" | "essay" | "flash", items: DueItem[]) => void;
  onBack: () => void;
  savedSession: any;
  onResumeSession: () => void;
  onClearSavedSession: () => void;
  preSelectedCategory?: string | null;
}

export default function ReviewSetup({
  dueCards, allCards, subcategories, srSettings,
  onSelectMode, onBack, savedSession, onResumeSession, onClearSavedSession,
  preSelectedCategory,
}: ReviewSetupProps) {
  const [setupStep, setSetupStep] = useState<"mode" | "filter">("mode");
  const [mode, setMode] = useState<ReviewMode>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(preSelectedCategory ?? null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [filterExamFrequent, setFilterExamFrequent] = useState(false);
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">("all");
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding(REVIEW_ONBOARDING_KEY));

  const dueCategories = useMemo(() => {
    const cats = new Set(dueCards.map((c) => c.category));
    return Array.from(cats).sort();
  }, [dueCards]);

  const filteredDueCards = useMemo(() => {
    let filtered = dueCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.category === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter((c) => c.chapter === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("često-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter((c) => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter((c) => c.type === "flash");
    return filtered;
  }, [dueCards, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType]);

  const filteredAllCards = useMemo(() => {
    let filtered = allCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.category === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    if (selectedChapter) filtered = filtered.filter((c) => c.chapter === selectedChapter);
    if (filterExamFrequent) filtered = filtered.filter((c) => c.tags?.includes("često-na-ispitu"));
    if (filterType === "essay") filtered = filtered.filter((c) => c.type === "essay");
    else if (filterType === "flash") filtered = filtered.filter((c) => c.type === "flash");
    return filtered;
  }, [allCards, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType]);

  const stabilizationItems = useMemo<DueItem[]>(() => {
    const items: DueItem[] = [];
    filteredDueCards.forEach((card) => {
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
  }, [filteredDueCards]);

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

  const dueSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    const subs = new Set(dueCards.filter((c) => c.category === selectedCategory && c.subcategory).map((c) => c.subcategory!));
    return Array.from(subs).sort();
  }, [dueCards, selectedCategory]);

  const dueChapters = useMemo(() => {
    if (!selectedSubcategory) return [];
    const chapters = new Set(dueCards.filter(c => c.category === selectedCategory && c.subcategory === selectedSubcategory && c.chapter).map(c => c.chapter!));
    return Array.from(chapters).sort();
  }, [dueCards, selectedCategory, selectedSubcategory]);

  const modeLabels: Record<string, string> = {
    stabilization: "Fokusirano Utvrđivanje",
    critical: "Kritični Pregled",
    hardest: "Najteža Pitanja",
  };

  const handleStartSession = useCallback(() => {
    const currentItems = mode === "stabilization" ? stabilizationItems
      : mode === "critical" ? criticalItems
      : hardestItems;
    onSelectMode(mode, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType, currentItems);
  }, [mode, selectedCategory, selectedSubcategory, selectedChapter, filterExamFrequent, filterType, onSelectMode, stabilizationItems, criticalItems, hardestItems]);

  // ── Step 1: Choose mode ──
  if (setupStep === "mode") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10 relative">
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
        <HowItWorksCorner onShowOnboarding={() => setShowOnboarding(true)} />

        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-display">Konsolidacija</h2>
          <p className="text-muted-foreground mt-2">Izaberi režim ponavljanja koji odgovara tvom cilju.</p>
        </div>

        {/* Resume saved session */}
        {savedSession && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
            <Play className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Sačuvana sesija</p>
              <p className="text-xs text-muted-foreground">
                Mod: {modeLabels[savedSession.mode] || savedSession.mode}
                {savedSession.selectedCategory && ` · ${savedSession.selectedCategory}`}
              </p>
            </div>
            <Button size="sm" onClick={onResumeSession} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Play className="h-3.5 w-3.5 mr-1" /> Nastavi
            </Button>
            <button onClick={onClearSavedSession} className="text-muted-foreground hover:text-foreground p-1">
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        )}

        {/* Mode selection */}
        <div className="grid gap-4">
          {[
            { key: "stabilization" as ReviewMode, icon: Target, label: "Fokusirano Utvrđivanje", sublabel: "Stabilizacija", count: stabilizationItems.length, color: "primary", desc: "Cilja nove eseje i one koje si skoro pogriješio. Ključno za brzo prebacivanje svježih informacija iz kratkoročne u dugoročnu memoriju." },
            { key: "critical" as ReviewMode, icon: Shield, label: "Kritični Pregled", sublabel: "Zadržavanje", count: criticalItems.length, color: "warning", desc: "Hvata kartice u idealnom trenutku zaborava (R ≈ 80–85%). Najbrži način da održiš sve eseje u glavi uz minimalan utrošak vremena." },
            { key: "hardest" as ReviewMode, icon: Zap, label: "Najteža Pitanja", sublabel: "Okršaj", count: hardestItems.length, color: "destructive", desc: "Direktan okršaj sa do 50 statistički najzahtjevnijih eseja. Uključuje tvoje \"Leech\" kartice (padovi ≥5×) i one sa najvećim indeksom težine." },
          ].map(({ key, icon: Icon, label, sublabel, count, color, desc }) => (
            <button
              key={key}
              onClick={() => { if (count > 0) { setMode(key); setSetupStep("filter"); } }}
              disabled={count === 0}
              className={`rounded-xl border bg-card p-6 text-left transition-colors group ${count > 0 ? `hover:border-${color}` : "opacity-50 cursor-not-allowed"}`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2.5 rounded-lg bg-${color}/10 text-${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium">{label}</h3>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{sublabel}</span>
                </div>
                <span className={`text-xs bg-${color}/10 text-${color} px-2.5 py-1 rounded-full font-medium`}>
                  {count} sekcija
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>
      </motion.div>
    );
  }

  // ── Step 2: Filters + Start ──
  const modeMeta = mode === "stabilization"
    ? { label: "Fokusirano Utvrđivanje", items: stabilizationItems }
    : mode === "critical"
    ? { label: "Kritični Pregled", items: criticalItems }
    : { label: "Najteža Pitanja", items: hardestItems };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
      <div>
        <button onClick={() => { setSetupStep("mode"); setMode(null); setSelectedCategory(null); setSelectedSubcategory(null); setSelectedChapter(null); setFilterExamFrequent(false); }} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
          <ArrowLeft className="h-4 w-4" /> Nazad na režime
        </button>
        <h2 className="text-3xl font-serif">{modeMeta.label}</h2>
        <p className="text-muted-foreground mt-2">{modeMeta.items.length} sekcija dostupno za ponavljanje.</p>
      </div>

      <SessionFilters
        layoutPrefix="review"
        cards={dueCards}
        categories={dueCategories}
        subcategories={subcategories}
        selectedCategory={selectedCategory}
        selectedSubcategory={selectedSubcategory}
        selectedChapter={selectedChapter}
        filterExamFrequent={filterExamFrequent}
        examFrequentCount={examFrequentCount}
        filterType={filterType}
        onSelectCategory={(cat) => { setSelectedCategory(cat); setSelectedSubcategory(null); setSelectedChapter(null); }}
        onSelectSubcategory={(sub) => { setSelectedSubcategory(sub); setSelectedChapter(null); }}
        onSelectChapter={setSelectedChapter}
        onToggleExamFrequent={() => setFilterExamFrequent(!filterExamFrequent)}
        onFilterTypeChange={setFilterType}
      />

      <Button
        onClick={handleStartSession}
        className="w-full py-6 text-base"
        disabled={modeMeta.items.length === 0}
      >
        <BookOpen className="h-4 w-4 mr-2" /> Počni konsolidaciju ({modeMeta.items.length} sekcija)
      </Button>
    </motion.div>
  );
}
