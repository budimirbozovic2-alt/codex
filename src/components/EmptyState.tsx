import { BookOpen, Brain, Sparkles, Info } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SectionState } from "@/lib/spaced-repetition";

interface Props {
  type: "dashboard" | "review";
  onAction?: () => void;
  /** FSRS diagnostics for review empty state */
  diagnostics?: {
    totalCards: number;
    newSections: number;
    reviewSections: number;
    nextDueDate?: string;
  };
}

export default function EmptyState({ type, onAction, diagnostics }: Props) {
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
          <h2 className="text-2xl font-semibold">Počnite sa učenjem</h2>
          <p className="text-muted-foreground">
            Kreirajte svoju prvu karticu i započnite put ka dugoročnom pamćenju kroz pametno ponavljanje.
          </p>
        </div>
        {onAction && (
          <Button onClick={onAction} size="lg" className="gap-2">
            <BookOpen className="h-4 w-4" /> Kreiraj prvu karticu
          </Button>
        )}
      </motion.div>
    );
  }

  // Review empty state with FSRS diagnostics
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
        <h2 className="text-2xl font-semibold">Sve je ponovljeno!</h2>
        <p className="text-muted-foreground">
          Nemate kartica za ponavljanje danas. Odlično — vaše znanje je ažurno. Vratite se sutra!
        </p>
      </div>

      {/* FSRS Diagnostics */}
      {diagnostics && diagnostics.totalCards > 0 && (
        <div className="rounded-lg border bg-card/50 px-5 py-4 max-w-xs space-y-3 text-left">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <Info className="h-3.5 w-3.5" />
            Dijagnostika
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">Ukupno kartica:</div>
            <div className="text-foreground font-medium text-right">{diagnostics.totalCards}</div>
            <div className="text-muted-foreground">Nove cjeline:</div>
            <div className="text-foreground font-medium text-right">
              <span className="text-amber-500">{diagnostics.newSections}</span>
            </div>
            <div className="text-muted-foreground">U ponavljanju:</div>
            <div className="text-foreground font-medium text-right">
              <span className="text-primary">{diagnostics.reviewSections}</span>
            </div>
          </div>
          {diagnostics.newSections > 0 && diagnostics.reviewSections === 0 && (
            <p className="text-[11px] text-muted-foreground/80 border-t pt-2">
              Sve cjeline su u stanju "Novo". Pokrenite <strong>Učenje</strong> da biste ih prebacili u režim ponavljanja.
            </p>
          )}
          {diagnostics.nextDueDate && (
            <p className="text-[11px] text-muted-foreground/80 border-t pt-2">
              Sljedeće ponavljanje: <strong>{diagnostics.nextDueDate}</strong>
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
