import { BookOpen, Brain, Sparkles, Info, FileText, Layers, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  type: "dashboard" | "review" | "cards" | "sources" | "learn-filter" | "generic";
  onAction?: () => void;
  actionLabel?: string;
  diagnostics?: {
    totalCards: number;
    newSections: number;
    reviewSections: number;
    nextDueDate?: string;
    /** FSRS schedule due (nextReview) — may exceed consolidation-eligible count. */
    scheduleDueCards?: number;
    consolidationDueCards?: number;
  };
  icon?: LucideIcon;
  title?: string;
  description?: string;
}

const PRESETS: Record<string, { icon: LucideIcon; title: string; description: string; actionLabel: string }> = {
  cards: {
    icon: Layers,
    title: "Nema kartica",
    description: "Kreirajte kartice da biste započeli učenje i ponavljanje.",
    actionLabel: "Kreiraj karticu",
  },
  sources: {
    icon: FileText,
    title: "Nema izvora",
    description: "Dodajte izvor materijala — tekst, članak ili DOCX dokument.",
    actionLabel: "Dodaj izvor",
  },
  "learn-filter": {
    icon: Layers,
    title: "Nema kartica za filter",
    description: "Promijenite filter ili kategoriju da biste nastavili učenje.",
    actionLabel: "Promijeni filter",
  },
};

export default function EmptyState({ type, onAction, actionLabel, diagnostics, icon, title, description }: Props) {
  if (type === "dashboard") {
    return (
      <div className="animate-fade-up flex flex-col items-center justify-center py-24 text-center space-y-7">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-primary/10 flex items-center justify-center shadow-soft ring-1 ring-hairline">
            <BookOpen className="h-11 w-11 text-primary" strokeWidth={1.4} />
          </div>
          <div className="absolute -top-2 -right-2 animate-subtle-pulse">
            <Sparkles className="h-6 w-6 text-warning" strokeWidth={1.6} />
          </div>
        </div>
        <div className="space-y-3 max-w-md">
          <h2 className="text-display text-4xl text-foreground text-balance">
            Počnite sa učenjem
          </h2>
          <p className="text-muted-foreground text-pretty leading-relaxed">
            Kreirajte svoju prvu karticu i započnite put ka dugoročnom pamćenju kroz pametno ponavljanje.
          </p>
        </div>
        {onAction && (
          <Button onClick={onAction} size="lg" className="gap-2 hover-lift pressable shadow-soft">
            <BookOpen className="h-4 w-4" strokeWidth={1.7} /> Kreiraj prvu karticu
          </Button>
        )}
      </div>
    );
  }

  if (type === "review") {
    const scheduleDue = diagnostics?.scheduleDueCards ?? 0;
    const consolidationDue = diagnostics?.consolidationDueCards ?? 0;
    const scheduleMismatch = scheduleDue > 0 && consolidationDue === 0;

    return (
      <div className="animate-fade-up flex flex-col items-center justify-center py-24 text-center space-y-7">
        <div className="relative">
          <div className="w-28 h-28 rounded-full bg-success/10 flex items-center justify-center shadow-soft ring-1 ring-hairline">
            <Brain className="h-11 w-11 text-success" strokeWidth={1.4} />
          </div>
          <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-success/20 flex items-center justify-center animate-subtle-pulse">
            <span className="text-success text-xs font-semibold">✓</span>
          </div>
        </div>
        <div className="space-y-3 max-w-md">
          <h2 className="text-display text-4xl text-foreground text-balance">
            {scheduleMismatch ? "Nema sesije konsolidacije" : "Sve je ponovljeno!"}
          </h2>
          <p className="text-muted-foreground text-pretty leading-relaxed">
            {scheduleMismatch ? (
              <>
                Imate <strong>{scheduleDue}</strong> kartica dospjelih po FSRS rasporedu, ali nijedna
                ne odgovara trenutnim režimima konsolidacije. Pokušajte{" "}
                <strong>Učenje</strong> za nove kartice ili sačekajte sljedeći FSRS termin.
              </>
            ) : (
              <>
                Nemate kartica za ponavljanje danas. Odlično — vaše znanje je ažurno. Vratite se sutra!
              </>
            )}
          </p>
        </div>

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
                <span className="text-warning">{diagnostics.newSections}</span>
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
      </div>
    );
  }

  const preset = PRESETS[type];
  const Icon = icon || preset?.icon || Layers;
  const heading = title || preset?.title || "Nema podataka";
  const desc = description || preset?.description || "Dodajte sadržaj da biste počeli.";
  const ctaLabel = actionLabel || preset?.actionLabel || "Dodaj";

  return (
    <div className="animate-fade-up flex flex-col items-center justify-center py-20 text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center ring-1 ring-hairline shadow-soft">
        <Icon className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div className="space-y-2 max-w-sm">
        <h3 className="text-display text-2xl text-foreground text-balance">{heading}</h3>
        <p className="text-sm text-muted-foreground text-pretty leading-relaxed">{desc}</p>
      </div>
      {onAction && (
        <Button onClick={onAction} variant="outline" className="gap-2 hover-lift pressable">
          <Icon className="h-4 w-4" strokeWidth={1.6} /> {ctaLabel}
        </Button>
      )}
    </div>
  );
}
