import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Target, Clock, Brain, TrendingUp, AlertTriangle, CheckCircle, XCircle, Gauge, Flame, Zap, Activity, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReviewLogEntry } from "@/lib/storage";
import { Card, SectionState, getCardRetrievability, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import {
  loadDiary, addDiaryEntry, DiaryEntry, setLastAnalysisDate,
  loadCalibration, CalibrationEntry, getCalibrationStats,
  loadLatency, LatencyEntry, getLatencyStats,
  getTodayReviewStats,
  loadSlippageLog, SlippageEntry, getDeepWorkStats,
  getLearningVelocity,
} from "@/lib/metacognitive-storage";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, Cell, CartesianGrid, Legend,
  PieChart, Pie, LineChart, Line, AreaChart, Area,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";

interface Props {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  onBack: () => void;
  settings?: SRSettings;
}

export default function MetacognitiveCenter({ cards, categories, reviewLog, onBack }: Props) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-serif">Metakognitivni Centar</h2>
          <p className="text-muted-foreground mt-1">Dnevnik, kalibracija i analitika učenja</p>
        </div>
      </div>

      <Tabs defaultValue="diary" className="w-full">
        <div className="space-y-1">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="diary" className="gap-1.5 text-xs sm:text-sm"><BookOpen className="h-3.5 w-3.5" /> Dnevnik</TabsTrigger>
            <TabsTrigger value="calibration" className="gap-1.5 text-xs sm:text-sm"><Target className="h-3.5 w-3.5" /> Kalibracija</TabsTrigger>
            <TabsTrigger value="latency" className="gap-1.5 text-xs sm:text-sm"><Clock className="h-3.5 w-3.5" /> Latencija</TabsTrigger>
          </TabsList>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="resistance" className="gap-1.5 text-xs sm:text-sm"><Flame className="h-3.5 w-3.5" /> Otpor</TabsTrigger>
            <TabsTrigger value="efficiency" className="gap-1.5 text-xs sm:text-sm"><Activity className="h-3.5 w-3.5" /> Efikasnost</TabsTrigger>
            <TabsTrigger value="prediction" className="gap-1.5 text-xs sm:text-sm"><CalendarClock className="h-3.5 w-3.5" /> Predikcija</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="diary">
          <DiaryTab cards={cards} reviewLog={reviewLog} />
        </TabsContent>
        <TabsContent value="calibration">
          <CalibrationTab />
        </TabsContent>
        <TabsContent value="latency">
          <LatencyTab />
        </TabsContent>
        <TabsContent value="resistance">
          <ResistanceTab cards={cards} categories={categories} reviewLog={reviewLog} />
        </TabsContent>
        <TabsContent value="efficiency">
          <EfficiencyTab />
        </TabsContent>
        <TabsContent value="prediction">
          <PredictionTab cards={cards} categories={categories} reviewLog={reviewLog} />
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

  // Last 7 days
  const recentDays = useMemo(() => {
    const days: { date: string; successes: number; lapses: number; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
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
      {/* Today's overview */}
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

      {/* Weekly chart */}
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

      {/* Lapses detail */}
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

      {/* Successes detail */}
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

      {/* Self-analysis form */}
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

      {/* History */}
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

// ═══════════════════════════════════════════════════════════
// CALIBRATION TAB
// ═══════════════════════════════════════════════════════════

function CalibrationTab() {
  const calibration = useMemo(() => loadCalibration(), []);
  const stats = useMemo(() => getCalibrationStats(calibration), [calibration]);

  // Scatter data: confidence vs actual grade
  const scatterData = useMemo(() => {
    return calibration.slice(-200).map(e => ({
      confidence: e.confidence,
      grade: e.actualGrade,
    }));
  }, [calibration]);

  // Distribution: for each confidence level, average actual grade
  const distributionData = useMemo(() => {
    const groups: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    calibration.forEach(e => { groups[e.confidence]?.push(e.actualGrade); });
    return Object.entries(groups).map(([conf, grades]) => ({
      confidence: `Sig. ${conf}`,
      avgGrade: grades.length > 0 ? +(grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1) : 0,
      count: grades.length,
    }));
  }, [calibration]);

  const pieData = [
    { name: "Prekalibrisan", value: stats.overconfident, fill: "hsl(var(--destructive))" },
    { name: "Potkalibris.", value: stats.underconfident, fill: "hsl(var(--warning))" },
    { name: "Kalibrisan", value: stats.calibrated, fill: "hsl(var(--success))" },
  ].filter(d => d.value > 0);

  if (calibration.length === 0) {
    return (
      <div className="mt-8 text-center space-y-3 py-12">
        <Gauge className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h3 className="text-lg font-medium">Nema podataka o kalibraciji</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Tokom ponavljanja, prije otkrivanja odgovora bićete upitani za nivo sigurnosti (1-5).
          Podaci se automatski prikupljaju.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-1">Mjerenja</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-success">{stats.calibrated}</div>
          <div className="text-xs text-muted-foreground mt-1">Kalibrisano</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className={`text-2xl font-bold ${stats.avgDelta > 0.3 ? "text-destructive" : stats.avgDelta < -0.3 ? "text-warning" : "text-success"}`}>
            {stats.avgDelta > 0 ? "+" : ""}{stats.avgDelta.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {stats.avgDelta > 0.3 ? "Iluzija znanja ⚠️" : stats.avgDelta < -0.3 ? "Potcjenjivanje" : "Dobra kalibracija ✓"}
          </div>
        </div>
      </div>

      {/* Iluzija znanja alert */}
      {stats.avgDelta > 0.3 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium text-destructive">Iluzija znanja detektovana</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vaša procjena sigurnosti je u prosjeku {stats.avgDelta.toFixed(1)} poena viša od stvarnog znanja.
              Usporite i budite kritičniji pri procjeni.
            </p>
          </div>
        </div>
      )}

      {/* Pie chart */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Distribucija kalibracije</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
              {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Pie>
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Bar chart: confidence level vs avg grade */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Sigurnost vs. Stvarna ocjena</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={distributionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="confidence" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis domain={[0, 4]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
            <Bar dataKey="avgGrade" name="Prosj. ocjena" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          Idealno: svaki nivo sigurnosti odgovara proporcionalnoj ocjeni. Ako su "Sigurnost 5" ocjene niske — imate iluziju znanja.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LATENCY TAB
// ═══════════════════════════════════════════════════════════

function LatencyTab() {
  const latency = useMemo(() => loadLatency(), []);
  const stats = useMemo(() => getLatencyStats(latency), [latency]);

  // Histogram: group by second buckets
  const histogramData = useMemo(() => {
    const buckets: Record<string, number> = { "0-1s": 0, "1-2s": 0, "2-3s": 0, "3-5s": 0, "5-10s": 0, "10s+": 0 };
    latency.forEach(e => {
      const s = e.latencyMs / 1000;
      if (s <= 1) buckets["0-1s"]++;
      else if (s <= 2) buckets["1-2s"]++;
      else if (s <= 3) buckets["2-3s"]++;
      else if (s <= 5) buckets["3-5s"]++;
      else if (s <= 10) buckets["5-10s"]++;
      else buckets["10s+"]++;
    });
    return Object.entries(buckets).map(([range, count]) => ({ range, count }));
  }, [latency]);

  // By category
  const byCategoryData = useMemo(() => {
    const groups: Record<string, number[]> = {};
    latency.forEach(e => {
      if (!groups[e.category]) groups[e.category] = [];
      groups[e.category].push(e.latencyMs);
    });
    return Object.entries(groups).map(([cat, times]) => ({
      category: cat.length > 15 ? cat.slice(0, 15) + "…" : cat,
      avgLatency: +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1),
      count: times.length,
    })).sort((a, b) => b.avgLatency - a.avgLatency);
  }, [latency]);

  if (latency.length === 0) {
    return (
      <div className="mt-8 text-center space-y-3 py-12">
        <Clock className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h3 className="text-lg font-medium">Nema podataka o latenciji</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Vrijeme od prikaza pitanja do klika na "Otkrij odgovor" automatski se mjeri tokom ponavljanja.
        </p>
      </div>
    );
  }

  const automatedPercent = stats.total > 0 ? Math.round((stats.automated / stats.total) * 100) : 0;

  return (
    <div className="space-y-6 mt-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{(stats.avg / 1000).toFixed(1)}s</div>
          <div className="text-xs text-muted-foreground mt-1">Prosječna latencija</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-success">{automatedPercent}%</div>
          <div className="text-xs text-muted-foreground mt-1">Automatizovano (≤3s)</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold text-destructive">{stats.notAutomated}</div>
          <div className="text-xs text-muted-foreground mt-1">Nije automatiz. (&gt;3s)</div>
        </div>
      </div>

      {stats.avg > 3000 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium">Spor priziv informacija</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Prosječno vam treba {(stats.avg / 1000).toFixed(1)}s da se sjetite. Cilj je &lt;3s za automatizovano znanje.
            </p>
          </div>
        </div>
      )}

      {/* Histogram */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Distribucija vremena priziva</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={histogramData}>
            <XAxis dataKey="range" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
            <Bar dataKey="count" name="Broj" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
              {histogramData.map((d, i) => (
                <Cell key={i} fill={d.range === "0-1s" || d.range === "1-2s" || d.range === "2-3s" ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* By category */}
      {byCategoryData.length > 1 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-medium mb-4">Latencija po kategorijama</h3>
          <ResponsiveContainer width="100%" height={Math.max(150, byCategoryData.length * 35)}>
            <BarChart data={byCategoryData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="s" />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
              <Bar dataKey="avgLatency" name="Prosj. (s)" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                {byCategoryData.map((d, i) => (
                  <Cell key={i} fill={d.avgLatency <= 3 ? "hsl(var(--success))" : "hsl(var(--destructive))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COGNITIVE RESISTANCE TAB
// ═══════════════════════════════════════════════════════════

interface ResistanceData {
  category: string;
  lapseCount: number;
  avgLatency: number; // seconds
  cognitiveLoad: number; // composite 0-100
  cardCount: number;
}

function ResistanceTab({ cards, categories, reviewLog }: { cards: Card[]; categories: string[]; reviewLog: ReviewLogEntry[] }) {
  const latencyData = useMemo(() => loadLatency(), []);

  const resistanceData = useMemo<ResistanceData[]>(() => {
    return categories
      .filter(cat => cards.some(c => c.category === cat))
      .map(cat => {
        const catCards = cards.filter(c => c.category === cat);
        const catLapses = reviewLog.filter(e => e.category === cat && e.grade <= 2);
        const catLatencies = latencyData.filter(e => e.category === cat);

        const avgLatency = catLatencies.length > 0
          ? catLatencies.reduce((s, e) => s + e.latencyMs, 0) / catLatencies.length / 1000
          : 0;

        // Cognitive load = weighted combo of lapse rate + avg latency + low retrievability
        const totalReviews = reviewLog.filter(e => e.category === cat).length;
        const lapseRate = totalReviews > 0 ? (catLapses.length / totalReviews) * 100 : 0;
        const latencyScore = Math.min(100, (avgLatency / 10) * 100); // 10s = max
        
        // Average retrievability (lower = harder)
        const avgRetrievability = catCards.length > 0
          ? catCards.reduce((s, c) => s + (getCardRetrievability(c) ?? 100), 0) / catCards.length
          : 100;
        const retrievabilityPenalty = Math.max(0, 100 - avgRetrievability);

        const cognitiveLoad = Math.round(
          lapseRate * 0.4 + latencyScore * 0.3 + retrievabilityPenalty * 0.3
        );

        return {
          category: cat,
          lapseCount: catLapses.length,
          avgLatency: +avgLatency.toFixed(1),
          cognitiveLoad: Math.min(100, cognitiveLoad),
          cardCount: catCards.length,
        };
      })
      .sort((a, b) => b.cognitiveLoad - a.cognitiveLoad);
  }, [cards, categories, reviewLog, latencyData]);

  const topHardStart = resistanceData.filter(d => d.cognitiveLoad > 0).slice(0, 3);

  if (resistanceData.length === 0) {
    return (
      <div className="mt-8 text-center space-y-3 py-12">
        <Flame className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h3 className="text-lg font-medium">Nema podataka o kognitivnom otporu</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Podaci se prikupljaju automatski tokom ponavljanja. Potrebno je bar nekoliko sesija.
        </p>
      </div>
    );
  }

  const getHeatColor = (load: number) => {
    if (load >= 60) return "bg-destructive/20 border-destructive/30 text-destructive";
    if (load >= 35) return "bg-warning/20 border-warning/30 text-warning";
    if (load >= 15) return "bg-primary/15 border-primary/20 text-primary";
    return "bg-success/15 border-success/20 text-success";
  };

  const getBarColor = (load: number) => {
    if (load >= 60) return "hsl(var(--destructive))";
    if (load >= 35) return "hsl(var(--warning))";
    if (load >= 15) return "hsl(var(--primary))";
    return "hsl(var(--success))";
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Hard Start recommendation */}
      {topHardStart.length > 0 && topHardStart[0].cognitiveLoad > 20 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h3 className="text-sm font-semibold">Hard Start — Preporučeni jutarnji prioriteti</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Predmeti sa najvećim kognitivnim otporom. Počnite dan sa njima dok je fokus najjači.
          </p>
          <div className="flex gap-2 flex-wrap">
            {topHardStart.map((d, i) => (
              <div key={d.category} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getHeatColor(d.cognitiveLoad)}`}>
                <span className="text-xs font-bold">{i + 1}.</span>
                <span className="text-sm font-medium">{d.category}</span>
                <span className="text-xs opacity-70">({d.cognitiveLoad}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap grid */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-medium">Kognitivni otpor po predmetima</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {resistanceData.map(d => (
            <div key={d.category} className={`rounded-xl border p-4 space-y-2 transition-all ${getHeatColor(d.cognitiveLoad)}`}>
              <p className="text-sm font-semibold truncate" title={d.category}>{d.category}</p>
              <div className="text-2xl font-bold">{d.cognitiveLoad}%</div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs opacity-80">
                  <span>Lapsusi</span>
                  <span>{d.lapseCount}</span>
                </div>
                <div className="flex justify-between text-xs opacity-80">
                  <span>Latencija</span>
                  <span>{d.avgLatency}s</span>
                </div>
                <div className="flex justify-between text-xs opacity-80">
                  <span>Kartice</span>
                  <span>{d.cardCount}</span>
                </div>
              </div>
              {/* Mini progress bar */}
              <div className="w-full h-1.5 rounded-full bg-background/50 overflow-hidden">
                <div className="h-full rounded-full bg-current opacity-50 transition-all" style={{ width: `${d.cognitiveLoad}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bar chart */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-4">Uporedni prikaz</h3>
        <ResponsiveContainer width="100%" height={Math.max(180, resistanceData.length * 40)}>
          <BarChart data={resistanceData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="%" />
            <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }}
              formatter={(value: number) => [`${value}%`, "Kognitivni teret"]}
            />
            <Bar dataKey="cognitiveLoad" name="Otpor" radius={[0, 4, 4, 0]}>
              {resistanceData.map((d, i) => (
                <Cell key={i} fill={getBarColor(d.cognitiveLoad)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-destructive/40" />
          <span>Visok (≥60%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-warning/40" />
          <span>Srednji (35-59%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-primary/30" />
          <span>Nizak (15-34%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-success/30" />
          <span>Savladan (&lt;15%)</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EFFICIENCY TAB (Slippage + Deep Work)
// ═══════════════════════════════════════════════════════════

function EfficiencyTab() {
  const slippageLog = useMemo(() => loadSlippageLog(), []);
  const deepWork = useMemo(() => getDeepWorkStats(7), []);
  const deepWork30 = useMemo(() => getDeepWorkStats(30), []);

  const formatMs = (ms: number) => {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  // Slippage stats
  const slippageStats = useMemo(() => {
    if (slippageLog.length === 0) return null;
    const slippages = slippageLog.filter(e => e.slippageMs !== null).map(e => e.slippageMs!);
    const avg = slippages.reduce((a, b) => a + b, 0) / slippages.length;
    const min = Math.min(...slippages);
    const max = Math.max(...slippages);
    return { avg, min, max, count: slippages.length };
  }, [slippageLog]);

  // Daily slippage chart
  const slippageChartData = useMemo(() => {
    return slippageLog
      .filter(e => e.slippageMs !== null)
      .slice(-14)
      .map(e => ({
        date: e.date.slice(5), // MM-DD
        slippage: +(e.slippageMs! / 1000).toFixed(0),
      }));
  }, [slippageLog]);

  const deepWorkPieData = [
    { name: "Deep Work", value: deepWork.deepWorkPercent, fill: "hsl(var(--success))" },
    { name: "Shallow Work", value: deepWork.shallowWorkPercent, fill: "hsl(var(--warning))" },
  ].filter(d => d.value > 0);

  const isHealthyRatio = deepWork.deepWorkPercent >= 70;

  return (
    <div className="space-y-6 mt-4">
      {/* Slippage summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">
            {slippageStats ? formatMs(slippageStats.avg) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Prosj. Slippage</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">
            {slippageStats ? formatMs(slippageStats.min) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Najbolji</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className={`text-2xl font-bold ${isHealthyRatio ? "text-success" : "text-warning"}`}>
            {deepWork.deepWorkPercent}%
          </div>
          <div className="text-xs text-muted-foreground mt-1">Deep Work (7d)</div>
        </div>
        <div className="rounded-xl border bg-card p-4 text-center">
          <div className="text-2xl font-bold">{formatMs(deepWork.totalMs)}</div>
          <div className="text-xs text-muted-foreground mt-1">Ukupno (7d)</div>
        </div>
      </div>

      {/* Deep Work ratio alert */}
      {deepWork.totalMs > 0 && !isHealthyRatio && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium">Previše pasivnog učenja</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Deep Work je {deepWork.deepWorkPercent}% — preporučeno ≥70%. Više koristite aktivno prisjećanje i ponavljanje.
            </p>
          </div>
        </div>
      )}

      {/* Slippage info */}
      {slippageStats && slippageStats.avg > 300000 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <Clock className="h-5 w-5 text-destructive shrink-0" />
          <div>
            <p className="text-sm font-medium">Visok Slippage</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              U prosjeku vam treba {formatMs(slippageStats.avg)} od otvaranja aplikacije do početka učenja.
              Pokušajte odmah kliknuti na "Uči" ili "Ponavljaj".
            </p>
          </div>
        </div>
      )}

      {/* Deep Work pie chart */}
      {deepWork.totalMs > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-medium mb-4">Deep Work vs. Shallow Work (7 dana)</h3>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width="50%" height={180}>
              <PieChart>
                <Pie data={deepWorkPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                  {deepWorkPieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} formatter={(v: number) => `${v}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-success" />
                <div>
                  <p className="text-sm font-medium">Deep Work: {formatMs(deepWork.deepWorkMs)}</p>
                  <p className="text-xs text-muted-foreground">Ponavljanje + Aktivno prisjećanje + Lanac</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-warning" />
                <div>
                  <p className="text-sm font-medium">Shallow: {formatMs(deepWork.shallowWorkMs)}</p>
                  <p className="text-xs text-muted-foreground">Slobodno čitanje</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground border-t pt-2">
                Cilj: ≥70% Deep Work
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Slippage trend */}
      {slippageChartData.length > 1 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-medium mb-4">Slippage trend (sekunde)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={slippageChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="s" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
              <Area type="monotone" dataKey="slippage" name="Slippage" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Slippage = vrijeme od otvaranja aplikacije do prvog klika na učenje/ponavljanje.
          </p>
        </div>
      )}

      {/* 30-day comparison */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-medium mb-3">Mjesečni pregled</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-xs text-muted-foreground">Deep Work (30d)</p>
            <p className="text-lg font-bold">{deepWork30.deepWorkPercent}%</p>
            <p className="text-xs text-muted-foreground">{formatMs(deepWork30.deepWorkMs)}</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-xs text-muted-foreground">Ukupno (30d)</p>
            <p className="text-lg font-bold">{formatMs(deepWork30.totalMs)}</p>
            <p className="text-xs text-muted-foreground">{slippageLog.length} sesija</p>
          </div>
        </div>
      </div>

      {slippageLog.length === 0 && deepWork.totalMs === 0 && (
        <div className="mt-8 text-center space-y-3 py-12">
          <Activity className="h-12 w-12 mx-auto text-muted-foreground/30" />
          <h3 className="text-lg font-medium">Nema podataka o efikasnosti</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Slippage i Deep Work omjer se automatski prate pri korištenju aplikacije.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PREDICTION TAB (Predictive Analytics)
// ═══════════════════════════════════════════════════════════

function PredictionTab({ cards, categories, reviewLog }: { cards: Card[]; categories: string[]; reviewLog: ReviewLogEntry[] }) {
  const velocity = useMemo(() => getLearningVelocity(reviewLog, categories), [reviewLog, categories]);

  // Calculate completion predictions per category
  const predictions = useMemo(() => {
    return categories
      .filter(cat => cards.some(c => c.category === cat))
      .map(cat => {
        const catCards = cards.filter(c => c.category === cat);
        const totalSections = catCards.reduce((s, c) => s + c.sections.length, 0);
        const masteredSections = catCards.reduce((s, c) =>
          s + c.sections.filter(sec => sec.state === SectionState.Review && sec.stability > 5).length, 0);
        const remaining = totalSections - masteredSections;
        const vel = velocity.find(v => v.category === cat);
        const dailyVelocity = vel?.velocity || 0;

        const daysRemaining = dailyVelocity > 0 ? Math.ceil(remaining / dailyVelocity) : null;
        const predictedDate = daysRemaining !== null ? new Date(Date.now() + daysRemaining * 86400000) : null;

        return {
          category: cat,
          totalSections,
          masteredSections,
          remaining,
          percent: totalSections > 0 ? Math.round((masteredSections / totalSections) * 100) : 0,
          dailyVelocity: dailyVelocity,
          daysRemaining,
          predictedDate,
          cardCount: catCards.length,
        };
      })
      .sort((a, b) => b.percent - a.percent);
  }, [cards, categories, velocity]);

  // Overall prediction
  const overall = useMemo(() => {
    const total = predictions.reduce((s, p) => s + p.totalSections, 0);
    const mastered = predictions.reduce((s, p) => s + p.masteredSections, 0);
    const remaining = total - mastered;
    const avgVelocity = velocity.reduce((s, v) => s + v.velocity, 0);
    const daysRemaining = avgVelocity > 0 ? Math.ceil(remaining / avgVelocity) : null;
    return { total, mastered, remaining, percent: total > 0 ? Math.round((mastered / total) * 100) : 0, daysRemaining };
  }, [predictions, velocity]);

  // Chart data for progress
  const chartData = predictions.map(p => ({
    category: p.category.length > 12 ? p.category.slice(0, 12) + "…" : p.category,
    savladano: p.percent,
    preostalo: 100 - p.percent,
  }));

  // Velocity chart
  const velocityData = velocity
    .filter(v => v.velocity > 0)
    .sort((a, b) => b.velocity - a.velocity)
    .map(v => ({
      category: v.category.length > 12 ? v.category.slice(0, 12) + "…" : v.category,
      velocity: +v.velocity.toFixed(1),
    }));

  if (predictions.length === 0) {
    return (
      <div className="mt-8 text-center space-y-3 py-12">
        <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground/30" />
        <h3 className="text-lg font-medium">Nema podataka za predikciju</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Potrebno je bar nekoliko sesija ponavljanja da bi sistem mogao predvidjeti tempo završetka.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-4">
      {/* Overall progress */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Ukupan napredak</h3>
          {overall.daysRemaining !== null && (
            <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full font-medium">
              ~{overall.daysRemaining} dana do kraja
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-4xl font-bold">{overall.percent}%</div>
          <div className="flex-1">
            <div className="w-full h-3 rounded-full bg-secondary overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${overall.percent}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full bg-primary"
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{overall.mastered} savladano</span>
              <span>{overall.remaining} preostalo od {overall.total}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Per-category predictions */}
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-medium">Predikcija po predmetima</h3>
        <div className="space-y-3">
          {predictions.map(p => (
            <div key={p.category} className="p-3 rounded-lg bg-secondary/30 border space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.category}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.masteredSections}/{p.totalSections} sekcija · {p.cardCount} kartica
                  </p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-bold">{p.percent}%</p>
                  {p.predictedDate ? (
                    <p className="text-xs text-muted-foreground">
                      ~{format(p.predictedDate, "dd.MM.yyyy")}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    p.percent >= 80 ? "bg-success" : p.percent >= 40 ? "bg-primary" : "bg-warning"
                  }`}
                  style={{ width: `${p.percent}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Brzina: {p.dailyVelocity > 0 ? `${p.dailyVelocity.toFixed(1)} sekcija/dan` : "—"}</span>
                {p.daysRemaining !== null && <span>Preostalo: ~{p.daysRemaining} dana</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Progress bar chart */}
      {chartData.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-medium mb-4">Uporedni napredak</h3>
          <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 40)}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="%" />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
              <Bar dataKey="savladano" name="Savladano" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} stackId="a" />
              <Bar dataKey="preostalo" name="Preostalo" fill="hsl(var(--secondary))" radius={[0, 4, 4, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Velocity chart */}
      {velocityData.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-medium mb-4">Brzina savladavanja (sekcija/dan)</h3>
          <ResponsiveContainer width="100%" height={Math.max(150, velocityData.length * 35)}>
            <BarChart data={velocityData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: 12 }} />
              <Bar dataKey="velocity" name="Sekcija/dan" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Bazirano na poslednjih 14 dana aktivnosti. Veća brzina = brže savladavanje gradiva.
          </p>
        </div>
      )}
    </div>
  );
}
