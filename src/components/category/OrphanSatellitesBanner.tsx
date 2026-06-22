import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Card } from "@/lib/spaced-repetition";

interface Props {
  orphans: Card[];
  onSelectAll: () => void;
}

export function OrphanSatellitesBanner({ orphans, onSelectAll }: Props) {
  if (orphans.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 p-2.5">
      <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
      <span className="text-xs text-foreground">
        {orphans.length} kartica: blic sa parentId koji ne postoji (obrisan esej ili import)
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onSelectAll}
        className="h-7 text-xs ml-auto"
      >
        Označi sve
      </Button>
    </div>
  );
}
