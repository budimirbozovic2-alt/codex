import { memo } from "react";
import { Activity, AlertTriangle, Sparkles } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { ContentRenderer } from "@/components/ui/ContentRenderer";
import type { Card } from "@/lib/spaced-repetition";
import type { CardStats } from "./useCardStats";

function retentionColor(pct: number): string {
  if (pct >= 80) return "text-success";
  if (pct >= 50) return "text-warning";
  return "text-destructive";
}

interface Props {
  card: Card;
  stats: CardStats | null;
}

function PassiveReaderCardImpl({ card, stats }: Props) {
  return (
    <article className="glass-card rounded-2xl p-8 space-y-5">
      <header className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Pasivno čitanje
        </p>
        <h2 className="text-2xl font-semibold text-foreground leading-tight">
          {card.question}
        </h2>

        {stats && (
          <TooltipProvider delayDuration={250}>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {stats.allNew && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                  <Sparkles className="h-3 w-3" /> Nova
                </span>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-muted/40 text-muted-foreground">
                    <Activity className="h-3 w-3" /> {stats.reads} pregleda
                  </span>
                </TooltipTrigger>
                <TooltipContent>Ukupan broj prikaza ove kartice</TooltipContent>
              </Tooltip>

              {stats.lapses > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-destructive/10 text-destructive">
                      <AlertTriangle className="h-3 w-3" /> {stats.lapses} grešaka
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Broj zaboravljanja (lapses) po sekcijama</TooltipContent>
                </Tooltip>
              )}

              {!stats.allNew && stats.avgStability > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-muted/40 text-muted-foreground">
                      Snaga ~{stats.avgStability < 1
                        ? `${Math.round(stats.avgStability * 24)}h`
                        : `${Math.round(stats.avgStability)}d`}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Prosječna FSRS stabilnost preko sekcija</TooltipContent>
                </Tooltip>
              )}

              {!stats.allNew && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-muted/40 ${retentionColor(stats.retention)}`}>
                      Retencija {stats.retention}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Trenutna procijenjena vjerovatnoća prisjećanja</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        )}
      </header>

      <div className="space-y-4">
        {(card.sections ?? []).map((sec) => (
          <section key={sec.id} className="space-y-1.5">
            {sec.title && (
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {sec.title}
              </h3>
            )}
            <ContentRenderer
              className="prose prose-sm max-w-none card-prose"
              doc={sec.contentDoc}
            />
          </section>
        ))}
      </div>
    </article>
  );
}

export const PassiveReaderCard = memo(PassiveReaderCardImpl);
