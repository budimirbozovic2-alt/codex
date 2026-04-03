import { BookOpen, Brain, Sparkles, Info } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/useT";

interface Props {
  type: "dashboard" | "review";
  onAction?: () => void;
  diagnostics?: {
    totalCards: number;
    newSections: number;
    reviewSections: number;
    nextDueDate?: string;
  };
}

export default function EmptyState({ type, onAction, diagnostics }: Props) {
  const t = useT();

  if (type === "dashboard") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center justify-center py-20 text-center space-y-6"
      >
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-10 w-10 text-primary" />
          </div>
          <motion.div
            animate={{ y: [-2, 2, -2], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="absolute -top-2 -right-2"
          >
            <Sparkles className="h-6 w-6 text-warning" />
          </motion.div>
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-2xl font-semibold">{t("empty.dashboardTitle")}</h2>
          <p className="text-muted-foreground">{t("empty.dashboardDesc")}</p>
        </div>
        {onAction && (
          <Button onClick={onAction} size="lg" className="gap-2">
            <BookOpen className="h-4 w-4" /> {t("empty.dashboardCta")}
          </Button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center justify-center py-20 text-center space-y-6"
    >
      <div className="relative">
        <div className="w-24 h-24 rounded-full bg-success/10 flex items-center justify-center">
          <Brain className="h-10 w-10 text-success" />
        </div>
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-success/20 flex items-center justify-center"
        >
          <span className="text-success text-xs">✓</span>
        </motion.div>
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-2xl font-semibold">{t("empty.reviewTitle")}</h2>
        <p className="text-muted-foreground">{t("empty.reviewDesc")}</p>
      </div>

      {diagnostics && diagnostics.totalCards > 0 && (
        <div className="rounded-lg border bg-card/50 px-5 py-4 max-w-xs space-y-3 text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Info className="h-3.5 w-3.5" />
            {t("empty.diagnostics")}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">{t("empty.totalCards")}</div>
            <div className="text-foreground font-medium text-right">{diagnostics.totalCards}</div>
            <div className="text-muted-foreground">{t("empty.newSections")}</div>
            <div className="text-foreground font-medium text-right">
              <span className="text-amber-500">{diagnostics.newSections}</span>
            </div>
            <div className="text-muted-foreground">{t("empty.inReview")}</div>
            <div className="text-foreground font-medium text-right">
              <span className="text-primary">{diagnostics.reviewSections}</span>
            </div>
          </div>
          {diagnostics.newSections > 0 && diagnostics.reviewSections === 0 && (
            <p className="text-[11px] text-muted-foreground/80 border-t pt-2"
               dangerouslySetInnerHTML={{ __html: t("empty.allNewHint") }} />
          )}
          {diagnostics.nextDueDate && (
            <p className="text-[11px] text-muted-foreground/80 border-t pt-2"
               dangerouslySetInnerHTML={{ __html: t("empty.nextReview", { date: diagnostics.nextDueDate }) }} />
          )}
        </div>
      )}
    </motion.div>
  );
}
