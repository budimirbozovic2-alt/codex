import { memo } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  top: number;
  left: number;
  onCreateSatellite: () => void;
}

function PassiveReaderSelectionBubbleImpl({ top, left, onCreateSatellite }: Props) {
  return (
    <div
      className="fixed z-50 -translate-x-1/2 -translate-y-full pb-1"
      style={{ top, left }}
      role="toolbar"
      aria-label="Akcije za označeni tekst"
    >
      <Button
        type="button"
        size="sm"
        className="h-8 gap-1.5 text-xs shadow-lg"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onCreateSatellite}
      >
        <Zap className="h-3.5 w-3.5" />
        Kreiraj blic satelit
      </Button>
    </div>
  );
}

export const PassiveReaderSelectionBubble = memo(PassiveReaderSelectionBubbleImpl);
