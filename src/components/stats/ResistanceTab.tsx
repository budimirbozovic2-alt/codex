import { Flame, Zap } from "lucide-react";
import { useMemo } from "react";


import { Card, getCardRetrievability } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { loadLatency } from "@/lib/metacognitive-storage";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
} from "recharts";

interface ResistanceData {
  category: string;
  lapseCount: number;
  avgLatency: number;
  cognitiveLoad: number;
  cardCount: number;
}

interface Props {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
  weights: { lapses: number; latency: number; forgetting: number };
}

export default function ResistanceTab({ cards, categories, reviewLog, weights }: Props) {
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

        const totalReviews = reviewLog.filter(e => e.category === cat).length;
        const lapseRate = totalReviews > 0 ? (catLapses.length / totalReviews) * 100 : 0;
        const latencyScore = Math.min(100, (avgLatency / 10) * 100);
        
        const avgRetrievability = catCards.length > 0
          ? catCards.reduce((s, c) => s + (getCardRetrievability(c) ?? 100), 0) / catCards.length
          : 100;
        const retrievabilityPenalty = Math.max(0, 100 - avgRetrievability);

        const wTotal = weights.lapses + weights.latency + weights.forgetting;
        const wL = wTotal > 0 ? weights.lapses / wTotal : 0.33;
        const wLat = wTotal > 0 ? weights.latency / wTotal : 0.33;
        const wF = wTotal > 0 ? weights.forgetting / wTotal : 0.34;

        const cognitiveLoad = Math.round(
          lapseRate * wL + latencyScore * wLat + retrievabilityPenalty * wF
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
  }, [cards, categories, reviewLog, latencyData, weights]);

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

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-medium">Kognitivni otpor po predmetima</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {resistanceData.map(d => (
            <div key={d.category} className={`rounded-xl border p-4 space-y-2 transition-all ${getHeatColor(d.cognitiveLoad)}`}>
              <p className="text-sm font-semibold truncate" title={d.category}>{d.category}</p>
              <div className="text-2xl font-bold">{d.cognitiveLoad}%</div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs opacity-80">
                  <span>Lapsusi</span><span>{d.lapseCount}</span>
                </div>
                <div className="flex justify-between text-xs opacity-80">
                  <span>Latencija</span><span>{d.avgLatency}s</span>
                </div>
                <div className="flex justify-between text-xs opacity-80">
                  <span>Kartice</span><span>{d.cardCount}</span>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-background/50 overflow-hidden">
                <div className="h-full rounded-full bg-current opacity-50 transition-all" style={{ width: `${d.cognitiveLoad}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

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

      <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-destructive/40" /><span>Visok (≥60%)</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-warning/40" /><span>Srednji (35-59%)</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-primary/30" /><span>Nizak (15-34%)</span></div>
        <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-success/30" /><span>Savladan (&lt;15%)</span></div>
      </div>
    </div>
  );
}
