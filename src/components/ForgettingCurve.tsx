import { TrendingDown, Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, SectionState } from "@/lib/spaced-repetition";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { motion } from "framer-motion";


import { Button } from "@/components/ui/button";
import { ChartTooltip } from "@/components/ui/chart-tooltip";
interface Props {
  cards: Card[];
  categories: string[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "#6366f1",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

export default function ForgettingCurve({ cards, categories }: Props) {
  const [showCategories, setShowCategories] = useState(false);

  // Get all reviewed sections with their stability
  const reviewedSections = useMemo(() => {
    return cards.flatMap((c) =>
      c.sections
        .filter((s) => s.state !== SectionState.New && s.stability > 0)
        .map((s) => ({ ...s, category: c.category }))
    );
  }, [cards]);

  // Calculate overall forgetting curve data
  const chartData = useMemo(() => {
    if (reviewedSections.length === 0) return [];

    const days = Array.from({ length: 31 }, (_, i) => i);

    return days.map((day) => {
      const point: any = { day };

      // Overall retention
      const retentions = reviewedSections.map((s) => {
        const elapsed = s.lastReviewed
          ? (Date.now() - s.lastReviewed) / (24 * 60 * 60 * 1000) + day
          : day;
        return Math.exp(-elapsed / s.stability) * 100;
      });
      point["Ukupno"] = Math.round(retentions.reduce((a, b) => a + b, 0) / retentions.length);

      // Per-category
      if (showCategories) {
        categories.forEach((cat) => {
          const catSections = reviewedSections.filter((s) => s.category === cat);
          if (catSections.length === 0) return;
          const catRetentions = catSections.map((s) => {
            const elapsed = s.lastReviewed
              ? (Date.now() - s.lastReviewed) / (24 * 60 * 60 * 1000) + day
              : day;
            return Math.exp(-elapsed / s.stability) * 100;
          });
          point[cat] = Math.round(catRetentions.reduce((a, b) => a + b, 0) / catRetentions.length);
        });
      }

      return point;
    });
  }, [reviewedSections, categories, showCategories]);

  // Calculate "evaporation" stats
  const evaporationStats = useMemo(() => {
    if (reviewedSections.length === 0) return null;
    const today = reviewedSections.filter((s) => {
      const elapsed = s.lastReviewed ? (Date.now() - s.lastReviewed) / (24 * 60 * 60 * 1000) : 0;
      return Math.exp(-elapsed / s.stability) >= 0.5;
    }).length;
    
    const in7days = reviewedSections.filter((s) => {
      const elapsed = s.lastReviewed ? (Date.now() - s.lastReviewed) / (24 * 60 * 60 * 1000) + 7 : 7;
      return Math.exp(-elapsed / s.stability) >= 0.5;
    }).length;

    const in30days = reviewedSections.filter((s) => {
      const elapsed = s.lastReviewed ? (Date.now() - s.lastReviewed) / (24 * 60 * 60 * 1000) + 30 : 30;
      return Math.exp(-elapsed / s.stability) >= 0.5;
    }).length;

    return {
      total: reviewedSections.length,
      today,
      lostIn7: today - in7days,
      lostIn30: today - in30days,
    };
  }, [reviewedSections]);

  if (reviewedSections.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border bg-card p-6 text-center"
      >
        <TrendingDown className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">Ponovite barem jednu karticu da vidite prognozu znanja.</p>
      </motion.div>
    );
  }

  const activeCategories = showCategories
    ? categories.filter((cat) => reviewedSections.some((s) => s.category === cat))
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-primary" />
            Prognoza znanja
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Predviđeni nivo zadržavanja informacija za narednih 30 dana
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCategories(!showCategories)}
          className="gap-1.5"
        >
          {showCategories ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showCategories ? "Sakrij kategorije" : "Po kategorijama"}
        </Button>
      </div>

      {/* Evaporation stats */}
      {evaporationStats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{evaporationStats.today}</p>
            <p className="text-xs text-muted-foreground">Upamćeno danas</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-warning">-{evaporationStats.lostIn7}</p>
            <p className="text-xs text-muted-foreground">Gubitak za 7 dana</p>
          </div>
          <div className="rounded-xl border bg-card p-4 text-center">
            <p className="text-2xl font-bold text-destructive">-{evaporationStats.lostIn30}</p>
            <p className="text-xs text-muted-foreground">Gubitak za 30 dana</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="rounded-xl border bg-card p-4">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}d`}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip labelPrefix="Dan" valueSuffix="%" />} />
              {showCategories && <Legend wrapperStyle={{ fontSize: 11 }} />}
              <Area
                type="monotone"
                dataKey="Ukupno"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill="url(#colorTotal)"
                dot={false}
              />
              {showCategories &&
                activeCategories.map((cat, i) => (
                  <Area
                    key={cat}
                    type="monotone"
                    dataKey={cat}
                    stroke={COLORS[(i + 1) % COLORS.length]}
                    strokeWidth={1.5}
                    fill="transparent"
                    dot={false}
                    strokeDasharray="4 3"
                  />
                ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Ako danas prestanete sa učenjem, vaše pamćenje opada po formuli R = e<sup>−t/S</sup>
        </p>
      </div>
    </motion.div>
  );
}
