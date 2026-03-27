import { X, AlertTriangle, CheckCircle } from "lucide-react";
import { Card, SectionState } from "@/lib/spaced-repetition";
import { getCardMasteryLevel, getMasteryColor, MASTERY_LEVELS } from "@/components/KnowledgeMap";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { motion } from "framer-motion";

interface AuditorDetailPanelProps {
  card: Card;
  onClose: () => void;
}

export default function AuditorDetailPanel({ card, onClose }: AuditorDetailPanelProps) {
  const level = getCardMasteryLevel(card);
  const ml = MASTERY_LEVELS[level];
  const avgStability = card.sections.reduce((s, sec) => s + sec.stability, 0) / card.sections.length;
  const avgDifficulty = card.sections.reduce((s, sec) => s + sec.difficulty, 0) / card.sections.length;
  const errorLog = card.errorLog || [];
  const totalErrors = errorLog.reduce((s, e) => s + e.count, 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-background border rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
      >
        <div className="p-5 border-b flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: ml.color }} />
              <span className="text-xs font-medium" style={{ color: ml.color }}>{ml.label}</span>
            </div>
            <h3 className="text-lg font-medium leading-tight">{card.question}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 border-b grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-lg font-medium">{avgStability.toFixed(1)}d</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Stabilnost</p>
          </div>
          <div>
            <p className="text-lg font-medium">{avgDifficulty.toFixed(1)}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Težina</p>
          </div>
          <div>
            <p className="text-lg font-medium">{totalErrors}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Greške</p>
          </div>
        </div>

        {/* Section mastery */}
        <div className="px-5 py-3 border-b">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Sekcije</p>
          <div className="flex flex-wrap gap-1.5">
            {card.sections.map(s => {
              const sLevel = s.state === SectionState.New ? 0 : s.stability < 3 ? 1 : s.stability < 7 ? 2 : s.stability < 15 ? 3 : s.stability <= 30 ? 4 : 5;
              return (
                <Tooltip key={s.id}>
                  <TooltipTrigger asChild>
                    <div className="px-2 py-1 rounded text-[10px] font-medium text-white" style={{ backgroundColor: getMasteryColor(sLevel) }}>
                      {s.title.length > 20 ? s.title.slice(0, 20) + "…" : s.title}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">{s.title} — {s.stability.toFixed(1)}d</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Errors */}
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h4 className="font-medium text-sm">Istorija poteškoća</h4>
          </div>
          {errorLog.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <CheckCircle className="h-4 w-4 text-success" />
              Nema zabilježenih grešaka
            </div>
          ) : (
            <div className="space-y-2">
              {[...errorLog].sort((a, b) => new Date(b.lastMissed).getTime() - new Date(a.lastMissed).getTime()).slice(0, 5).map((err, i) => (
                <div key={i} className="p-2 rounded-lg border text-xs">
                  <span className="font-medium text-destructive">{err.text}</span>
                  <div className="flex gap-3 mt-1 text-muted-foreground">
                    <span>×{err.count}</span>
                    <span>Streak: {err.successStreak || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
