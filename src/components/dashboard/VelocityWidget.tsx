import { TrendingUp, BarChart3 } from "lucide-react";
import { memo } from "react";
import { motion } from "framer-motion";
interface Props {
  velocityData: { velocity: number; trend: "up" | "down" | "flat" } | null;
  weakestCategories: { name: string; score: number; total: number }[];
  showVelocity: boolean;
  showWeakCategories: boolean;
}

export const VelocityWidget = memo(function VelocityWidget({ velocityData, weakestCategories, showVelocity, showWeakCategories }: Props) {
  if (!showVelocity && !showWeakCategories) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {showVelocity && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
          className="rounded-xl bg-card border p-5 space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Brzina učenja</h3>
          </div>
          {velocityData ? (
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-semibold tabular-nums">{velocityData.velocity}</p>
                <span className="text-sm text-muted-foreground">sekcija/dan</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {velocityData.trend === "up" ? "📈 Raste u odnosu na prošlu sedmicu" :
                 velocityData.trend === "down" ? "📉 Pada u odnosu na prošlu sedmicu" :
                 "➡️ Stabilan tempo"}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Učitavanje...</p>
          )}
        </motion.div>
      )}
      {showWeakCategories && weakestCategories.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}
          className="rounded-xl bg-card border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Najslabije kategorije</h3>
          </div>
          <div className="space-y-2">
            {weakestCategories.map((cat, i) => (
              <div key={cat.name} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium truncate">{cat.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{cat.score}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${cat.score < 30 ? "bg-destructive" : cat.score < 60 ? "bg-warning" : "bg-primary"}`}
                      style={{ width: `${cat.score}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
});
