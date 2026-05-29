import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function PassiveReaderPager({ index, total, onPrev, onNext }: Props) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="outline" onClick={onPrev} disabled={index <= 0} className="gap-1.5">
        <ChevronLeft className="h-4 w-4" /> Prethodna
      </Button>
      <p className="text-[11px] text-muted-foreground">
        Tastatura: ← / → za navigaciju
      </p>
      <Button
        variant="outline"
        onClick={onNext}
        disabled={index >= total - 1}
        className="gap-1.5"
      >
        Sljedeća <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
