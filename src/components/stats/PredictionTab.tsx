import { useMemo } from "react";
import { motion } from "framer-motion";

import { Card, SectionState } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { getLearningVelocity } from "@/lib/metacognitive-storage";
import { Progress } from "@/components/ui/progress";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import CalendarClock from "lucide-react/dist/esm/icons/calendar-clock";
interface Props {
  cards: Card[];
  categories: string[];
  reviewLog: ReviewLogEntry[];
}

export default function PredictionTab({ cards, categories, reviewLog }: Props) {
  const velocity = useMemo(() => getLearningVelocity(reviewLog, categories), [reviewLog, categories]);

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
          category: cat, totalSections, masteredSections, remaining,
          percent: totalSections > 0 ? Math.round((masteredSections / totalSections) * 100) : 0,
          dailyVelocity, daysRemaining, predictedDate,
          cardCount: catCards.length,
        };
      })
      .sort((a, b) => b.percent - a.percent);
  }, [cards, categories, velocity]);

  const overall = useMemo(() => {
    const total = predictions.reduce((s, p) => s + p.totalSections, 0);
    const mastered = predictions.reduce((s, p) => s + p.masteredSections, 0);
    const remaining = total - mastered;
    const avgVelocity = velocity.reduce((s, v) => s + v.velocity, 0);
    const daysRemaining = avgVelocity > 0 ? Math.ceil(remaining / avgVelocity) : null;
    return { total, mastered, remaining, percent: total > 0 ? Math.round((mastered / total) * 100) : 0, daysRemaining };
  }, [predictions, velocity]);

  const chartData = predictions.map(p => ({
    category: p.category.length > 12 ? p.category.slice(0, 12) + "…" : p.category,
    savladano: p.percent,
    preostalo: 100 - p.percent,
  }));

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

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <h3 className="text-sm font-medium">Predikcija po predmetima</h3>
        <div className="space-y-3">
          {predictions.map(p => (
            <div key={p.category} className="p-3 rounded-lg bg-secondary/30 border space-y-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.category}</p>
                  <p className="text-xs text-muted-foreground">{p.masteredSections}/{p.totalSections} sekcija · {p.cardCount} kartica</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="text-sm font-bold">{p.percent}%</p>
                  {p.predictedDate ? (
                    <p className="text-xs text-muted-foreground">~{format(p.predictedDate, "dd.MM.yyyy")}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">—</p>
                  )}
                </div>
              </div>
              <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${p.percent >= 80 ? "bg-success" : p.percent >= 40 ? "bg-primary" : "bg-warning"}`}
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
