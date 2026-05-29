import { memo, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface StatusIcon {
  key: string;
  icon: ReactNode;
  color: string;
  label: string;
  critical: boolean;
  extraLabel?: string;
}

interface Props {
  icons: StatusIcon[];
  onExport?: () => void;
  storagePercent?: number;
}

export const StatusIconsRow = memo(function StatusIconsRow({ icons, onExport, storagePercent }: Props) {
  if (icons.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div
        role="status"
        aria-label="Sistemska upozorenja"
        className="animate-fade-up flex items-center gap-2 flex-wrap rounded-lg border border-border/60 bg-card/60 px-3 py-2 w-full"
        style={{ animationDelay: "40ms", animationFillMode: "both" }}>
        {icons.map(si => (
          <Tooltip key={si.key}>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1.5 px-3 py-2 glass-card cursor-default ${si.color}`}>
                {si.icon}
                {si.critical && <span className="text-xs font-medium">{si.key === "memory" ? "Memorija" : si.key === "storage" ? `${storagePercent}%` : ""}</span>}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">{si.label}</p>
              {si.key === "backup" && onExport && (
                <button onClick={onExport} className="mt-1 text-xs text-primary underline">Napravi backup</button>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
});
