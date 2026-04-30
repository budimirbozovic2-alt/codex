import { Target, Shield, Zap, BookOpen, ArrowLeft, Play, X as XIcon, HelpCircle, RotateCcw, Lock, Info } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import OnboardingModal, { hasSeenOnboarding } from "@/components/OnboardingModal";
import { DueItem, ReviewMode, REVIEW_ONBOARDING_KEY, REVIEW_SLIDES } from "./review-constants";
import { buildStabilizationItems, buildCriticalItems, buildHardestItems } from "@/lib/review-mode-builder";
import type { CategoryRecord } from "@/lib/db";
import InfoPanel from "@/components/InfoPanel";

type FilterType = "all" | "essay" | "flash";

interface ReviewSetupProps {
  dueCards: Card[];
  allCards: Card[];
  categoryRecords: CategoryRecord[];
  subcategories?: Record<string, string[]>;
  srSettings: SRSettings;
  onSelectMode: (mode: ReviewMode, category: string | null, subcategory: string | null, chapter: string | null, examFrequent: boolean, filterType: FilterType, items: DueItem[]) => void;
  onBack: () => void;
  savedSession: { mode: ReviewMode; selectedCategory?: string | null } | null;
  onResumeSession: () => void;
  onClearSavedSession: () => void;
  
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

const FILTER_TYPE_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Sve" },
  { value: "essay", label: "Esejska" },
  { value: "flash", label: "Blic" },
];

export default function ReviewSetup({
  dueCards, allCards, categoryRecords, srSettings,
  onSelectMode, onBack, savedSession, onResumeSession, onClearSavedSession,
  lockedCategory,
}: ReviewSetupProps) {
  const [mode, setMode] = useState<ModeKey>("critical");
  const selectedCategory = lockedCategory ?? null;
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [showOnboarding, setShowOnboarding] = useState(() => !hasSeenOnboarding(REVIEW_ONBOARDING_KEY));

  // Type-only filter — sub/chapter narrowing intentionally removed to keep
  // FSRS prioritization intact across all consolidation modes.
  const filterByType = useCallback((cards: Card[]) => {
    if (filterType === "essay") return cards.filter((c) => c.type === "essay");
    if (filterType === "flash") return cards.filter((c) => c.type === "flash");
    return cards;
  }, [filterType]);

  const filteredDueCards = useMemo(() => {
    let filtered = dueCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.categoryId === selectedCategory);
    return filterByType(filtered);
  }, [dueCards, selectedCategory, filterByType]);

  const filteredAllCards = useMemo(() => {
    let filtered = allCards;
    if (selectedCategory) filtered = filtered.filter((c) => c.categoryId === selectedCategory);
    return filterByType(filtered);
  }, [allCards, selectedCategory, filterByType]);

  const stabilizationItems = useMemo<DueItem[]>(
    () => buildStabilizationItems({ dueCards: filteredDueCards, allCards: filteredAllCards, srSettings }),
    [filteredDueCards, filteredAllCards, srSettings],
  );

  const criticalItems = useMemo<DueItem[]>(
    () => buildCriticalItems({ dueCards: filteredDueCards, allCards: filteredAllCards, srSettings }),
    [filteredDueCards, filteredAllCards, srSettings],
  );

  const hardestItems = useMemo<DueItem[]>(
    () => buildHardestItems({ dueCards: filteredDueCards, allCards: filteredAllCards, srSettings }),
    [filteredDueCards, filteredAllCards, srSettings],
  );

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

  const handleStartSession = useCallback(() => {
    onSelectMode(mode, selectedCategory, null, null, false, filterType, itemsByMode[mode]);
  }, [mode, selectedCategory, filterType, onSelectMode, itemsByMode]);

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

      {/* Title + inline type filter */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RotateCcw className="h-6 w-6 text-primary" /> Konsolidacija znanja
          </h2>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Izaberi pristup ponavljanju za ovu sesiju.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Tip pitanja"
          className="inline-flex items-center gap-1 bg-secondary rounded-lg p-1"
        >
          {FILTER_TYPE_OPTIONS.map(({ value, label }) => {
            const active = filterType === value;
            return (
              <button
                key={value}
                role="radio"
                aria-checked={active}
                onClick={() => setFilterType(value)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
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

      {/* FSRS scope notice for stabilization */}
      {mode === "stabilization" && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-muted/50 border text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <span>
            FSRS bira sekcije po prioritetu zaborava — bez ručnog sužavanja po sub-kategoriji ili poglavlju.
          </span>
        </div>
      )}

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
