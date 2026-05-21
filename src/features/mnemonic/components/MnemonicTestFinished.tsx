import { ArrowLeft, Brain, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { SessionStats } from "../hooks/useTestEngine";

interface Props {
  stats: SessionStats;
  onBack: () => void;
  onRestart: () => void;
}

export default function MnemonicTestFinished({ stats, onBack, onRestart }: Props) {
  const total = stats.correct + stats.wrong;
  const pct = total > 0 ? Math.round((stats.correct / total) * 100) : 0;
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Nazad
      </button>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-12 space-y-6">
        <Brain className="h-16 w-16 mx-auto text-primary" />
        <h2 className="imperial-title">Testiranje završeno!</h2>
        <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
          <div className="rounded-xl bg-card border p-4">
            <p className="text-2xl font-bold text-success">{stats.correct}</p>
            <p className="text-xs text-muted-foreground">Tačno</p>
          </div>
          <div className="rounded-xl bg-card border p-4">
            <p className="text-2xl font-bold text-destructive">{stats.wrong}</p>
            <p className="text-xs text-muted-foreground">Netačno</p>
          </div>
          <div className="rounded-xl bg-card border p-4">
            <p className={`text-2xl font-bold ${pct >= 70 ? "text-success" : pct >= 40 ? "text-warning" : "text-destructive"}`}>{pct}%</p>
            <p className="text-xs text-muted-foreground">Uspješnost</p>
          </div>
        </div>
        <Button onClick={onRestart} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Novi dril
        </Button>
      </motion.div>
    </div>
  );
}
