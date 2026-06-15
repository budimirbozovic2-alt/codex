import { ArrowLeft, Pause } from "lucide-react";
import type { ReactNode } from "react";
import { m } from "@/lib/motion";
import ShortcutsHint from "@/components/ShortcutsHint";

export interface SessionChromeShortcut {
  keys: string;
  description: string;
}

interface Props {
  onBack: () => void;
  backLabel?: string;
  onPause?: () => void;
  modeBadge?: ReactNode;
  scopeBadge?: ReactNode;
  viewWidthControl?: ReactNode;
  progressLabel: string;
  progressCurrent: number;
  progressTotal: number;
  shortcuts: SessionChromeShortcut[];
}

export function SessionChrome({
  onBack,
  backLabel = "Nazad",
  onPause,
  modeBadge,
  scopeBadge,
  viewWidthControl,
  progressLabel,
  progressCurrent,
  progressTotal,
  shortcuts,
}: Props) {
  const pct = progressTotal > 0 ? (progressCurrent / progressTotal) * 100 : 0;

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1"
            aria-label={backLabel}
          >
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </button>
          {onPause && (
            <button
              type="button"
              onClick={onPause}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-secondary text-xs"
              title="Pauziraj sesiju i nastavi kasnije"
              aria-label="Pauziraj sesiju"
            >
              <Pause className="h-3.5 w-3.5" /> Pauza
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {scopeBadge}
          {modeBadge}
          {viewWidthControl}
          <span className="text-sm text-muted-foreground tabular">{progressLabel}</span>
          <ShortcutsHint shortcuts={shortcuts} />
        </div>
      </div>

      <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
        <m.div
          className="h-full bg-primary rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </>
  );
}
