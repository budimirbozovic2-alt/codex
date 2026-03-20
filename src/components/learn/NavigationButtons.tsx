import React from "react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as ArrowRight } from "lucide-react/dist/esm/icons/arrow-right";
import { Button } from "@/components/ui/button";

interface Props {
  currentIndex: number;
  totalCards: number;
  onPrev: () => void;
  onNext: () => void;
}

const NavigationButtons = React.memo(function NavigationButtons({ currentIndex, totalCards, onPrev, onNext }: Props) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <Button variant="outline" onClick={onPrev} disabled={currentIndex === 0} className="flex-1">
        <ArrowLeft className="h-4 w-4 mr-2" /> Prethodna
      </Button>
      <Button variant="outline" onClick={onNext} disabled={currentIndex + 1 >= totalCards} className="flex-1">
        Sljedeća <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
});

export default NavigationButtons;
