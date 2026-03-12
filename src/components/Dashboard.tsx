import { Brain, Clock, Layers, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { getCategoryStats, Card } from "@/lib/spaced-repetition";

interface Props {
  stats: { due: number; total: number; totalSections: number; learnedSections: number };
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  categories: string[];
  onStartReview: () => void;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : "bg-destructive";
  return (
    <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`h-full rounded-full ${color}`}
      />
    </div>
  );
}

export default function Dashboard({ stats, categoryStats, categories, onStartReview }: Props) {
  const topStats = [
    { label: "Za ponavljanje", value: stats.due, icon: Clock, accent: "text-primary" },
    { label: "Ukupno pitanja", value: stats.total, icon: Layers, accent: "text-muted-foreground" },
    { label: "Ukupno cjelina", value: stats.totalSections, icon: BookOpen, accent: "text-muted-foreground" },
    { label: "Naučene cjeline", value: stats.learnedSections, icon: Brain, accent: "text-success" },
  ];

  return (
    <div className="space-y-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-5xl md:text-6xl font-serif italic tracking-tight">
          Učenje kroz<br />
          <span className="text-primary">ponavljanje</span>
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-md">
          Esejska pitanja razdvojena na cjeline sa praćenjem znanja.
        </p>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {topStats.map(({ label, value, icon: Icon, accent }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
            className="rounded-xl bg-card border p-5"
          >
            <Icon className={`h-5 w-5 ${accent} mb-3`} />
            <p className="text-3xl font-serif">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </motion.div>
        ))}
      </div>

      {stats.due > 0 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          onClick={onStartReview}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-8 py-4 rounded-xl text-lg font-medium hover:opacity-90 transition-opacity"
        >
          <Brain className="h-5 w-5" />
          Ponavljaj ({stats.due})
        </motion.button>
      )}

      {/* Category Knowledge Overview */}
      {categories.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          <h2 className="text-2xl font-serif">Znanje po kategorijama</h2>
          <div className="grid gap-3">
            {categories.map((cat) => {
              const s = categoryStats[cat];
              if (!s || s.total === 0) return null;
              return (
                <div key={cat} className="rounded-xl bg-card border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{cat}</span>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{s.score}%</span>
                      {s.due > 0 && (
                        <span className="text-primary">{s.due} za ponavljanje</span>
                      )}
                    </div>
                  </div>
                  <ScoreBar score={s.score} />
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
