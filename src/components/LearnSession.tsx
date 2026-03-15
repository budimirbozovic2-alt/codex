import { useState, useMemo } from "react";
import { Card, getCardScore, CARD_TAGS } from "@/lib/spaced-repetition";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, ChevronRight, BookOpen, Check, Eye, TrendingDown, ListOrdered, Zap, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { speak } from "@/lib/tts";

type SortMode = "order" | "weakest" | "leastRead";

interface Props {
  cards: Card[];
  categories: string[];
  subcategories: Record<string, string[]>;
  onMarkRead: (id: string) => void;
  onBack: () => void;
}

export default function LearnSession({ cards, categories, subcategories, onMarkRead, onBack }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("order");
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [readCards, setReadCards] = useState<Set<string>>(new Set());

  const availableCategories = useMemo(() => {
    const cats = new Set(cards.map((c) => c.category));
    return categories.filter((c) => cats.has(c));
  }, [cards, categories]);

  const availableSubs = selectedCategory ? (subcategories[selectedCategory] || []) : [];

  const sortedCards = useMemo(() => {
    let filtered = selectedCategory ? cards.filter((c) => c.category === selectedCategory) : [...cards];
    if (selectedSubcategory) {
      filtered = filtered.filter((c) => c.subcategory === selectedSubcategory);
    }
    switch (sortMode) {
      case "weakest":
        return filtered.sort((a, b) => getCardScore(a) - getCardScore(b));
      case "leastRead":
        return filtered.sort((a, b) => (a.readCount || 0) - (b.readCount || 0));
      case "order":
      default:
        return filtered.sort((a, b) => a.createdAt - b.createdAt);
    }
  }, [cards, selectedCategory, selectedSubcategory, sortMode]);

  const card = sortedCards[currentIndex];

  const handleMarkRead = () => {
    if (!card) return;
    onMarkRead(card.id);
    setReadCards((prev) => new Set(prev).add(card.id));
  };

  const goNext = () => {
    if (currentIndex + 1 < sortedCards.length) {
      setCurrentIndex((i) => i + 1);
      setExpandedSections(new Set());
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
      setExpandedSections(new Set());
    }
  };

  const toggleSection = (i: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const showAll = () => {
    setExpandedSections(new Set(card.sections.map((_, i) => i)));
  };

  // Setup screen
  if (!started) {
    const sortOptions: { key: SortMode; label: string; desc: string; icon: typeof ListOrdered }[] = [
      { key: "order", label: "Hronološki raspored", desc: "Kronološkim redoslijedom kako su dodana", icon: ListOrdered },
      { key: "weakest", label: "Pitanja sa najslabijim rezultatima", desc: "Pitanja sa najnižim rezultatom prvo", icon: TrendingDown },
      { key: "leastRead", label: "Pitanja sa najmanje pregleda", desc: "Nepročitana i najmanje čitana pitanja prvo", icon: Eye },
    ];

    const filteredCount = sortedCards.length;

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-xl mx-auto space-y-8 py-10">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-serif">Učenje</h2>
          <p className="text-muted-foreground mt-2">Čitaj i prolazi kroz pitanja. {filteredCount} pitanja dostupno.</p>
        </div>

        {/* Category filter */}
        {availableCategories.length >= 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Kategorija</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!selectedCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
              >
                Sve
              </button>
              {availableCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => { setSelectedCategory(c); setSelectedSubcategory(null); }}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subcategory filter */}
        {selectedCategory && availableSubs.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Podkategorija</label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedSubcategory(null)}
                className={`px-2.5 py-1 rounded-md text-xs transition-colors ${!selectedSubcategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
              >
                Sve
              </button>
              {availableSubs.map((sc) => (
                <button
                  key={sc}
                  onClick={() => setSelectedSubcategory(sc)}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${selectedSubcategory === sc ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                >
                  {sc}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sort mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Redoslijed</label>
          <div className="grid gap-3">
            {sortOptions.map(({ key, label, desc, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSortMode(key)}
                className={`rounded-xl border p-4 text-left transition-colors flex items-center gap-4 ${
                  sortMode === key ? "border-primary bg-primary/5" : "bg-card hover:border-primary/50"
                }`}
              >
                <div className={`p-2 rounded-lg ${sortMode === key ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={() => setStarted(true)} className="w-full py-6 text-base" disabled={filteredCount === 0}>
          <BookOpen className="h-4 w-4 mr-2" /> Počni učenje
        </Button>
      </motion.div>
    );
  }

  if (!card) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6 py-20">
        <h2 className="text-4xl font-serif italic">Svaka čast!</h2>
        <p className="text-muted-foreground text-lg">Prošli ste sva pitanja.</p>
        <p className="text-sm text-muted-foreground">Pročitano u ovoj sesiji: {readCards.size}</p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" /> Nazad
        </Button>
      </motion.div>
    );
  }

  const score = getCardScore(card);
  const isRead = readCards.has(card.id);
  const isFlash = card.type === "flash";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => setStarted(false)} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <span className="text-sm text-muted-foreground">
          {currentIndex + 1} / {sortedCards.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          animate={{ width: `${((currentIndex + 1) / sortedCards.length) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={card.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {/* Card header */}
          <div className="rounded-xl bg-card border p-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
                {card.subcategory && (
                  <span className="text-xs text-muted-foreground">› {card.subcategory}</span>
                )}
                {isFlash && (
                  <span className="text-xs text-primary flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Blic
                  </span>
                )}
                {(card.tags || []).map((t) => {
                  const tag = CARD_TAGS.find((ct) => ct.id === t);
                  if (!tag) return null;
                  const isFrequent = t === "često-na-ispitu";
                  return (
                    <span key={t} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                      isFrequent ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"
                    }`}>
                      {tag.label}
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="px-2 py-1 rounded-md bg-secondary">Snaga: {score}%</span>
                <span className="px-2 py-1 rounded-md bg-secondary">Pročitano: {card.readCount || 0}×</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xl leading-relaxed font-serif flex-1">{card.question}</p>
              <button onClick={() => speak(card.question)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Pročitaj naglas">
                <Volume2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          {isFlash ? (
            <div className="space-y-3">
              <div className="rounded-xl border bg-card overflow-hidden">
                <button
                  onClick={() => toggleSection(0)}
                  className="w-full flex items-center gap-2 p-4 text-left hover:bg-secondary/30 transition-colors"
                >
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSections.has(0) ? "rotate-90" : ""}`} />
                  <span className="font-medium text-sm">Odgovor</span>
                </button>
                {expandedSections.has(0) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="px-4 pb-4 border-t"
                  >
                    <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: card.sections[0]?.content || "" }} />
                  </motion.div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{card.sections.length} cjelina</span>
                <button onClick={showAll} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Prikaži sve
                </button>
              </div>

              {card.sections.map((section, i) => (
                <div key={section.id} className="rounded-xl border bg-card overflow-hidden">
                  <button
                    onClick={() => toggleSection(i)}
                    className="w-full flex items-center gap-2 p-4 text-left hover:bg-secondary/30 transition-colors"
                  >
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedSections.has(i) ? "rotate-90" : ""}`} />
                    <span className="font-medium text-sm">{section.title}</span>
                  </button>
                  {expandedSections.has(i) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="px-4 pb-4 border-t"
                    >
                      <div className="pt-4 text-sm leading-relaxed whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: section.content }} />
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" onClick={goPrev} disabled={currentIndex === 0} className="flex-1">
              <ArrowLeft className="h-4 w-4 mr-2" /> Prethodna
            </Button>
            {!isRead ? (
              <Button onClick={() => { handleMarkRead(); goNext(); }} className="flex-1">
                <Check className="h-4 w-4 mr-2" /> Pročitano
              </Button>
            ) : (
              <Button variant="outline" onClick={goNext} disabled={currentIndex + 1 >= sortedCards.length} className="flex-1">
                Sljedeća <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
