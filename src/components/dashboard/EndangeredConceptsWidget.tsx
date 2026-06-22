import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { isEndangeredEssay } from "@/lib/saga/endangered-display";
import { EndangeredConceptsPanel } from "@/components/saga/EndangeredConceptsPanel";

interface Props {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
}

/** Home dashboard slice — endangered essays with causes + global rehab CTA. */
export function EndangeredConceptsWidget({ cards, reviewLog }: Props) {
  const endangeredEssays = cards.filter(isEndangeredEssay);
  return (
    <EndangeredConceptsPanel
      essays={endangeredEssays}
      allCards={cards}
      reviewLog={reviewLog}
      maxItems={4}
      showRehabCta
    />
  );
}
