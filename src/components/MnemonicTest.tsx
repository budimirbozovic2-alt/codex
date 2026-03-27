import { ArrowLeft, Brain, CheckCircle, XCircle, RotateCcw, Zap, Timer, FolderOpen, Clock, List, MoreHorizontal, Filter } from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { MnemonicCard, HookType } from "@/lib/mnemonic-storage";


import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
interface Props {
  cards: MnemonicCard[];
  onRecordResult: (cardId: string, success: boolean) => void;
  onBack: () => void;
}

const RECALL_TIME_LIMIT = 3;

const HOOK_TYPE_CONFIG: Record<HookType, { label: string; icon: typeof Clock }> = {
  "rokovi": { label: "Rokovi", icon: Clock },
  "nabrajanja": { label: "Nabrajanja", icon: List },
  "ostalo": { label: "Ostalo", icon: MoreHorizontal },
};

export default function MnemonicTest({ cards, onRecordResult, onBack }: Props) {
  const [phase, setPhase] = useState<"selector" | "reminder" | "test" | "finished">("selector");

  // Drill selector filters
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSubcategory, setFilterSubcategory] = useState<string | null>(null);
  const [filterHookType, setFilterHookType] = useState<HookType | null>(null);

  const allTestable = useMemo(() => cards.filter(c => c.mnemonicStatus !== "new"), [cards]);

  // Build category tree from testable cards
  const categoryTree = useMemo(() => {
    const tree: Record<string, Set<string>> = {};
    allTestable.forEach(c => {
      if (!tree[c.category]) tree[c.category] = new Set();
      if (c.subcategory) tree[c.category].add(c.subcategory);
    });
    return tree;
  }, [allTestable]);

  const hookTypeCounts = useMemo(() => {
    const counts: Record<HookType, number> = { rokovi: 0, nabrajanja: 0, ostalo: 0 };
    allTestable.forEach(c => { counts[c.hookType] = (counts[c.hookType] || 0) + 1; });
    return counts;
  }, [allTestable]);

  // Filtered testable cards based on selector
  const filteredTestable = useMemo(() => {
    let result = allTestable;
    if (filterCategory) result = result.filter(c => c.category === filterCategory);
    if (filterSubcategory) result = result.filter(c => c.subcategory === filterSubcategory);
    if (filterHookType) result = result.filter(c => c.hookType === filterHookType);
    return result;
  }, [allTestable, filterCategory, filterSubcategory, filterHookType]);

  const [queue, setQueue] = useState<MnemonicCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showTrigger, setShowTrigger] = useState(false);
  const [timerActive, setTimerActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(RECALL_TIME_LIMIT);
  const [timedOut, setTimedOut] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, wrong: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentCard = queue[currentIndex];

  useEffect(() => {
    if (!timerActive) return;
    setTimeLeft(RECALL_TIME_LIMIT);
    setTimedOut(false);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0.1) {
          clearInterval(timerRef.current!);
          setTimedOut(true);
          setTimerActive(false);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerActive]);

  const startSession = useCallback(() => {
    setQueue([...filteredTestable].sort(() => Math.random() - 0.5));
    setCurrentIndex(0);
    setShowTrigger(false);
    setTimerActive(false);
    setTimedOut(false);
    setSessionStats({ correct: 0, wrong: 0 });
    setPhase("reminder");
  }, [filteredTestable]);

  const startRecall = useCallback(() => {
    setShowTrigger(true);
    setTimerActive(true);
    setTimedOut(false);
  }, []);

  const handleResult = useCallback((success: boolean) => {
    if (!currentCard) return;
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerActive(false);
    onRecordResult(currentCard.id, success);
    setSessionStats(prev => ({
      correct: prev.correct + (success ? 1 : 0),
      wrong: prev.wrong + (success ? 0 : 1),
    }));
    setShowTrigger(false);
    setTimedOut(false);
    if (currentIndex + 1 >= queue.length) {
      setPhase("finished");
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentCard, currentIndex, queue.length, onRecordResult]);

  const restart = () => {
    setPhase("selector");
  };

  // No testable cards at all
  if (allTestable.length === 0) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="text-center py-16">
          <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground">Nema kartica spremnih za testiranje.</p>
          <p className="text-sm text-muted-foreground mt-1">Obradi kartice u Radionici prvo (status "U radionici" ili "Spremna").</p>
        </div>
      </div>
    );
  }

  // Drill Selector
  if (phase === "selector") {
    const subcategories = filterCategory ? [...(categoryTree[filterCategory] || [])] : [];

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>

        <div>
          <h2 className="text-3xl font-display flex items-center gap-3">
            <Filter className="h-7 w-7 text-primary" /> Izbor drila
          </h2>
          <p className="text-muted-foreground mt-1">Filtriraj kartice za testiranje.</p>
        </div>

        {/* Category filter */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" /> Predmet
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setFilterCategory(null); setFilterSubcategory(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filterCategory ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
            >
              Svi ({allTestable.length})
            </button>
            {Object.entries(categoryTree).map(([cat, subs]) => {
              const count = allTestable.filter(c => c.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => { setFilterCategory(filterCategory === cat ? null : cat); setFilterSubcategory(null); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterCategory === cat ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Subcategory */}
          {subcategories.length > 0 && (
            <div className="pl-3 border-l-2 border-primary/20 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Kategorija</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFilterSubcategory(null)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${!filterSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
                >
                  Sve
                </button>
                {subcategories.map(sub => {
                  const count = allTestable.filter(c => c.category === filterCategory && c.subcategory === sub).length;
                  return (
                    <button
                      key={sub}
                      onClick={() => setFilterSubcategory(filterSubcategory === sub ? null : sub)}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${filterSubcategory === sub ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary"}`}
                    >
                      {sub} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Hook type filter */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tip kuke</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterHookType(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!filterHookType ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
            >
              Svi tipovi
            </button>
            {(["rokovi", "nabrajanja", "ostalo"] as HookType[]).map(ht => {
              const conf = HOOK_TYPE_CONFIG[ht];
              const Icon = conf.icon;
              return (
                <button
                  key={ht}
                  onClick={() => setFilterHookType(filterHookType === ht ? null : ht)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterHookType === ht ? "bg-primary text-primary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
                >
                  <Icon className="h-3 w-3" />
                  {conf.label} ({hookTypeCounts[ht]})
                </button>
              );
            })}
          </div>
        </div>

        {/* Start button */}
        <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{filteredTestable.length} kartica u drilu</p>
            <p className="text-xs text-muted-foreground">
              {filterCategory || "Svi predmeti"}{filterSubcategory ? ` › ${filterSubcategory}` : ""}{filterHookType ? ` • ${HOOK_TYPE_CONFIG[filterHookType].label}` : ""}
            </p>
          </div>
          <Button onClick={startSession} disabled={filteredTestable.length === 0} className="gap-2">
            <Zap className="h-4 w-4" /> Započni ({filteredTestable.length})
          </Button>
        </div>
      </div>
    );
  }

  // Reminder
  if (phase === "reminder") {
    return (
      <div className="max-w-xl mx-auto space-y-8">
        <button onClick={() => setPhase("selector")} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12 space-y-6">
          <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Zap className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-3xl font-display">Aktiviraj mentalni okidač</h2>
          <div className="max-w-sm mx-auto space-y-3 text-sm text-muted-foreground">
            <p>Prije početka testiranja, pripremi se mentalno:</p>
            <div className="rounded-xl border bg-card p-4 text-left space-y-2">
              <p className="flex items-center gap-2"><span className="text-primary font-bold">1.</span> Zatvori oči na 3 sekunde</p>
              <p className="flex items-center gap-2"><span className="text-primary font-bold">2.</span> Vizualizuj svoju "mentalnu sobu"</p>
              <p className="flex items-center gap-2"><span className="text-primary font-bold">3.</span> Aktiviraj asocijativni film za svaku karticu</p>
            </div>
            <p className="text-xs">
              <Timer className="inline h-3 w-3 mr-1" />
              Imaš <strong className="text-foreground">{RECALL_TIME_LIMIT} sekunde</strong> da prizoveš mentalnu kuku.
            </p>
            <p className="text-xs text-muted-foreground">Dril: {queue.length} kartica</p>
          </div>
          <Button onClick={() => setPhase("test")} size="lg" className="gap-2">
            <Zap className="h-4 w-4" /> Započni testiranje
          </Button>
        </motion.div>
      </div>
    );
  }

  // Finished
  if (phase === "finished") {
    const total = sessionStats.correct + sessionStats.wrong;
    const pct = total > 0 ? Math.round(sessionStats.correct / total * 100) : 0;
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12 space-y-6">
          <Brain className="h-16 w-16 mx-auto text-primary" />
          <h2 className="text-3xl font-display">Testiranje završeno!</h2>
          <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
            <div className="rounded-xl bg-card border p-4">
              <p className="text-2xl font-display text-success">{sessionStats.correct}</p>
              <p className="text-xs text-muted-foreground">Tačno</p>
            </div>
            <div className="rounded-xl bg-card border p-4">
              <p className="text-2xl font-display text-destructive">{sessionStats.wrong}</p>
              <p className="text-xs text-muted-foreground">Netačno</p>
            </div>
            <div className="rounded-xl bg-card border p-4">
              <p className={`text-2xl font-display ${pct >= 70 ? "text-success" : pct >= 40 ? "text-warning" : "text-destructive"}`}>{pct}%</p>
              <p className="text-xs text-muted-foreground">Uspješnost</p>
            </div>
          </div>
          <Button onClick={restart} className="gap-2">
            <RotateCcw className="h-4 w-4" /> Novi dril
          </Button>
        </motion.div>
      </div>
    );
  }

  // Test phase
  const hasTrigger = !!(currentCard?.mnemonicVideo || currentCard?.acronym);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={() => setPhase("selector")} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{currentIndex + 1} / {queue.length}</span>
          <span className="text-success">{sessionStats.correct} ✓</span>
          <span className="text-destructive">{sessionStats.wrong} ✗</span>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex) / queue.length) * 100}%` }}
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentCard.id + currentIndex}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          className="rounded-xl border bg-card p-6 space-y-6"
        >
          <div>
            <p className="text-xs text-muted-foreground mb-2">{currentCard.category}{currentCard.subcategory ? ` / ${currentCard.subcategory}` : ""}</p>
            <h3 className="text-xl font-display">{currentCard.question}</h3>
          </div>

          {!showTrigger && !timedOut && (
            <Button onClick={startRecall} variant="outline" className="w-full gap-2">
              <Zap className="h-4 w-4" /> Prizovi mentalnu kuku ({RECALL_TIME_LIMIT}s)
            </Button>
          )}

          {showTrigger && !timedOut && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground"><Timer className="h-3 w-3" /> Vrijeme za prizivanje</span>
                  <span className={`font-mono font-bold tabular-nums ${timeLeft <= 1 ? "text-destructive" : "text-primary"}`}>{timeLeft.toFixed(1)}s</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full transition-colors ${timeLeft <= 1 ? "bg-destructive" : "bg-primary"}`}
                    style={{ width: `${(timeLeft / RECALL_TIME_LIMIT) * 100}%` }}
                  />
                </div>
              </div>

              {hasTrigger ? (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-2">
                  <p className="text-xs font-medium text-primary uppercase tracking-wider">Tvoj okidač</p>
                  {currentCard.hookMode === "acronym" && currentCard.acronym && <p className="text-lg font-bold">{currentCard.acronym}</p>}
                  {currentCard.hookMode === "video" && currentCard.mnemonicVideo && <p className="text-sm italic text-muted-foreground">{currentCard.mnemonicVideo}</p>}
                  {/* Fallback for cards without hookMode */}
                  {!currentCard.hookMode && currentCard.acronym && <p className="text-lg font-bold">{currentCard.acronym}</p>}
                  {!currentCard.hookMode && currentCard.mnemonicVideo && <p className="text-sm italic text-muted-foreground">{currentCard.mnemonicVideo}</p>}
                </div>
              ) : (
                <div className="rounded-lg bg-warning/5 border border-warning/20 p-4">
                  <p className="text-sm text-warning">⚠ Nema sačuvanog okidača. Obradi ovu karticu u Radionici.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => handleResult(false)} variant="outline" className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                  <XCircle className="h-4 w-4" /> Ne sjećam se
                </Button>
                <Button onClick={() => handleResult(true)} className="gap-2 bg-success text-success-foreground hover:bg-success/90">
                  <CheckCircle className="h-4 w-4" /> Znam!
                </Button>
              </div>
            </motion.div>
          )}

          {timedOut && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-center space-y-2">
                <Timer className="h-8 w-8 mx-auto text-destructive" />
                <p className="text-sm font-medium text-destructive">Vrijeme isteklo!</p>
                <p className="text-xs text-muted-foreground">Kuka nije prizvana u {RECALL_TIME_LIMIT} sekunde.</p>
              </div>
              {hasTrigger && (
                <div className="rounded-lg bg-secondary/30 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">Tvoj okidač je bio:</p>
                  {currentCard.acronym && <p className="text-sm font-medium">{currentCard.acronym}</p>}
                  {currentCard.mnemonicVideo && <p className="text-sm italic text-muted-foreground">{currentCard.mnemonicVideo}</p>}
                </div>
              )}
              <Button onClick={() => handleResult(false)} variant="outline" className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/10">
                <XCircle className="h-4 w-4" /> Dalje (netačno)
              </Button>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
