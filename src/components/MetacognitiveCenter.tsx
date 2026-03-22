import { useState, useMemo, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as Clock } from "lucide-react/dist/esm/icons/clock";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { default as CheckCircle } from "lucide-react/dist/esm/icons/check-circle";
import { default as XCircle } from "lucide-react/dist/esm/icons/x-circle";
import InfoPanel from "@/components/InfoPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReviewLogEntry } from "@/lib/storage";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import {
  loadDiary, addDiaryEntry, DiaryEntry, setLastAnalysisDate,
  getTodayReviewStats,
  getTimeDistribution, RESERVOIR_LABELS, RESERVOIR_COLORS,
} from "@/lib/metacognitive-storage";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { format, startOfDay } from "date-fns";

const FrequentErrors = lazy(() => import("@/pages/FrequentErrors"));
const CognitiveAnalytics = lazy(() => import("./CognitiveAnalytics"));

interface Props {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  onBack: () => void;
  settings?: SRSettings;
  embedded?: boolean;
  onClearErrorLog?: (cardId: string) => void;
}

export default function MetacognitiveCenter({ cards, categories, reviewLog, onBack, settings, embedded, onClearErrorLog }: Props) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div>
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
              <ArrowLeft className="h-4 w-4" /> Nazad
            </button>
            <h2 className="text-3xl font-serif">Dnevnik</h2>
            <p className="text-muted-foreground mt-1">Refleksije, greške i kognitivna dijagnostika</p>
          </div>
          <InfoPanel title="Kako radi Dnevnik?">
            <p><strong className="text-foreground">Dnevnik</strong> — bilježi dnevne refleksije, postavlja ciljeve i prati samoanalizu. Svaki unos podržava oznake raspoloženja i kognitivnog stanja.</p>
            <p><strong className="text-foreground">Greške & Dijagnostika</strong> — praćenje čestih grešaka sa statusima (aktivna, riješena, u obradi) i mnemonička rješenja za svaku grešku.</p>
            <p><strong className="text-foreground">Analiza slabih tačaka</strong> — sistem identifikuje obrasce iz grešaka i predlaže fokusirano ponavljanje problematičnih oblasti.</p>
          </InfoPanel>
        </div>
      )}

      <Tabs defaultValue="diary" className="w-full">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="diary" className="gap-1.5 text-xs sm:text-sm"><BookOpen className="h-3.5 w-3.5" /> Dnevnik</TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5 text-xs sm:text-sm"><AlertTriangle className="h-3.5 w-3.5" /> Greške & Dijagnostika</TabsTrigger>
        </TabsList>

        <TabsContent value="diary">
          <DiaryTab cards={cards} reviewLog={reviewLog} />
        </TabsContent>
        <TabsContent value="errors">
          <Suspense fallback={<div className="py-8 text-center text-muted-foreground text-sm">Učitavanje…</div>}>
            <div className="space-y-8 mt-4">
              {/* Frequent Errors section */}
              <FrequentErrors cards={cards} onBack={() => {}} onClearErrorLog={onClearErrorLog || (() => {})} embedded />

              {/* Cognitive Analytics — mnemonic recommendations integrated here */}
              <div className="border-t pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-4 w-4 text-primary" />
                  <h3 className="font-serif text-lg">Kognitivna dijagnostika</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Analiza interferencija, slijepih tačaka i slabih kuka — sa preporukama za mnemoničku obradu problematičnih kartica.
                </p>
                <CognitiveAnalytics cards={cards} categories={categories} reviewLog={reviewLog} />
              </div>
            </div>
          </Suspense>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// DIARY TAB
// ═══════════════════════════════════════════════════════════

function DiaryTab({ cards, reviewLog }: { cards: Card[]; reviewLog: ReviewLogEntry[] }) {
  const [diary, setDiary] = useState<DiaryEntry[]>(() => loadDiary());
  const [dailyGoal, setDailyGoal] = useState("");
  const [selfAnalysis, setSelfAnalysis] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const todayEntry = diary.find(d => d.date === today);
  const todayStats = useMemo(() => getTodayReviewStats(reviewLog), [reviewLog]);
  const todayTime = useMemo(() => getTimeDistribution(1), []);

  const cardMap = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);

  const handleSave = () => {
    const entry = addDiaryEntry({ date: today, dailyGoal: dailyGoal || todayEntry?.dailyGoal || "", selfAnalysis });
    setLastAnalysisDate(today);
    setDiary(prev => {
      const idx = prev.findIndex(d => d.date === today);
      if (idx >= 0) { const next = [...prev]; next[idx] = entry; return next; }
      return [...prev, entry];
    });
    setSelfAnalysis("");
  };

  const recentDays = useMemo(() => {
    const days: { date: string; successes: number; lapses: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayStart = startOfDay(d).getTime();
      const dayEnd = dayStart + 86400000;
      const dayEntries = reviewLog.filter(e => e.timestamp >= dayStart && e.timestamp < dayEnd);
      days.push({
        date: format(d, "EEE dd"),
        successes: dayEntries.filter(e => e.grade === 4).length,
        lapses: dayEntries.filter(e => e.grade <= 2).length,
        total: dayEntries.length,
      });
    }
    return days;
  }, [reviewLog]);

  return (
    <div className="space-y-6 mt-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{todayStats.total}</div>
          <div className="text-xs text-muted-foreground mt-1">Ukupno danas</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <CheckCircle className="h-4 w-4 text-success" />
            <span className="text-2xl font-bold text-success">{todayStats.successes.length}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Uspjesi (4)</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="flex items-center justify-center gap-1">
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-2xl font-bold text-destructive">{todayStats.lapses.length}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">Lapsusi (1-2)</div>
        </div>
      </div>

      {todayTime.totalMs > 60000 && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Radno vrijeme danas</span>
          </div>
          <div className="flex h-2.5 rounded-md overflow-hidden bg-secondary">
            {todayTime.review > 0 && <div style={{ width: `${(todayTime.review / todayTime.totalMs) * 100}%`, background: RESERVOIR_COLORS.review }} />}
            {todayTime.learning > 0 && <div style={{ width: `${(todayTime.learning / todayTime.totalMs) * 100}%`, background: RESERVOIR_COLORS.learning }} />}
            {todayTime.creative > 0 && <div style={{ width: `${(todayTime.creative / todayTime.totalMs) * 100}%`, background: RESERVOIR_COLORS.creative }} />}
            {todayTime.analysis > 0 && <div style={{ width: `${(todayTime.analysis / todayTime.totalMs) * 100}%`, background: RESERVOIR_COLORS.analysis }} />}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Efektivno: {Math.round(todayTime.cognitiveMs / 60000)} min</span>
            <span>Logistika: {Math.round(todayTime.logisticMs / 60000)} min</span>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Sedmični pregled</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={recentDays}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
            <Bar dataKey="successes" name="Uspjesi" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="lapses" name="Lapsusi" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {todayStats.lapses.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Današnji lapsusi
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {todayStats.lapses.map((l, i) => {
              const card = cardMap.get(l.cardId);
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${l.grade === 1 ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}>
                    {l.grade}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{card?.question || "Nepoznata kartica"}</p>
                    <p className="text-xs text-muted-foreground">{l.category}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {todayStats.successes.length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-success" /> Današnji uspjesi
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {todayStats.successes.map((s, i) => {
              const card = cardMap.get(s.cardId);
              const hasMnemonic = card?.tags?.includes("memorizacija");
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-success/5 border border-success/10">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-success text-success-foreground">4</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{card?.question || "Nepoznata kartica"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.category}
                      {hasMnemonic && " · Mnemotehnika"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" /> Dnevna samoanaliza
        </h3>
        {todayEntry && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs text-muted-foreground mb-1">Cilj dana:</p>
            <p className="text-sm">{todayEntry.dailyGoal || "—"}</p>
            {todayEntry.selfAnalysis && (
              <>
                <p className="text-xs text-muted-foreground mt-2 mb-1">Analiza:</p>
                <p className="text-sm">{todayEntry.selfAnalysis}</p>
              </>
            )}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Dnevni cilj</label>
            <Input
              value={dailyGoal}
              onChange={e => setDailyGoal(e.target.value)}
              placeholder="Npr. Savladati 3 nova zakona..."
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Šta je bilo dobro? Šta mijenjam sutra?</label>
            <Textarea
              value={selfAnalysis}
              onChange={e => setSelfAnalysis(e.target.value)}
              placeholder="Kratka refleksija o današnjem učenju..."
              rows={3}
              className="text-sm"
            />
          </div>
          <Button onClick={handleSave} size="sm" disabled={!selfAnalysis.trim()}>
            Sačuvaj analizu
          </Button>
        </div>
      </div>

      {diary.filter(d => d.date !== today).length > 0 && (
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h3 className="text-sm font-medium">Istorija dnevnika</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {diary
              .filter(d => d.date !== today)
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, 14)
              .map(d => (
                <div key={d.id} className="p-3 rounded-lg bg-secondary/50 border space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{d.date}</span>
                  </div>
                  {d.dailyGoal && <p className="text-xs text-muted-foreground">Cilj: {d.dailyGoal}</p>}
                  <p className="text-sm">{d.selfAnalysis}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
