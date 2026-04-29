import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import {
  computeAdaptiveModifiers,
  type AdaptiveContext,
  type AdaptiveReason,
} from "@/lib/spaced-repetition";

interface Props {
  ctx: AdaptiveContext;
  baseRetention: number;
}

/**
 * Collapsible debug/explanation panel showing why the current card's
 * scheduling was adjusted (which reason codes fired, how much retention
 * was boosted, and what the interval multiplier ended up being).
 */
export default function AdaptiveReasonPanel({ ctx, baseRetention }: Props) {
  const [open, setOpen] = useState(false);

  const mods = useMemo(() => computeAdaptiveModifiers(ctx), [ctx]);
  const effectiveRetention = Math.max(0.80, Math.min(0.98, baseRetention + mods.retentionBoost));
  const hasReasons = mods.reasons.length > 0;

  return (
    <div className="rounded-md border border-border bg-card/60 text-xs">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Info className="h-3.5 w-3.5" />
        <span>Zašto ovaj interval?</span>
        {hasReasons && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
            {mods.reasons.length} pravil{mods.reasons.length === 1 ? "o" : "a"}
          </span>
        )}
      </button>

      {open && (
        <div className="px-2.5 pb-2.5 space-y-2 border-t border-border">
          <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
            <div className="flex flex-col">
              <span className="text-muted-foreground">Bazna retencija</span>
              <span className="font-mono">{(baseRetention * 100).toFixed(1)}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Efektivna retencija</span>
              <span className="font-mono">{(effectiveRetention * 100).toFixed(1)}%</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Multiplikator intervala</span>
              <span className="font-mono">×{mods.intervalMultiplier.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground">Neto retention boost</span>
              <span className="font-mono">{mods.retentionBoost >= 0 ? "+" : ""}{(mods.retentionBoost * 100).toFixed(1)}%</span>
            </div>
          </div>

          {hasReasons ? (
            <ul className="space-y-1">
              {mods.reasons.map((r: AdaptiveReason) => (
                <li
                  key={r.code}
                  className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1"
                >
                  <span className="truncate">{r.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                    {r.retentionDelta >= 0 ? "+" : ""}{(r.retentionDelta * 100).toFixed(1)}% · ×{r.intervalFactor.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[11px] text-muted-foreground italic">
              Nema aktivnih adaptivnih pravila — koristi se standardni FSRS interval.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
