import React from "react";
import { Card } from "@/lib/spaced-repetition";

interface Props {
  cards: Card[];
  currentIndex: number;
  completedCards: Set<string>;
  chainCompletedCards: Set<string>;
  readCards: Set<string>;
  onSelect: (index: number) => void;
}

const QuestionDots = React.memo(function QuestionDots({
  cards, currentIndex, completedCards, readCards, onSelect,
}: Props) {
  if (cards.length <= 1) return null;

  return (
    <div className="flex gap-1.5 flex-wrap mb-4">
      {cards.map((c, i) => {
        const isActive = i === currentIndex;
        let dotColor = "bg-secondary";
        if (completedCards.has(c.id)) dotColor = "bg-emerald-400 dark:bg-emerald-500";

        return (
          <button
            key={c.id}
            onClick={() => onSelect(i)}
            className={`w-3 h-3 rounded-full transition-all ${dotColor} ${isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-125" : "hover:scale-110"}`}
            title={`${i + 1}. ${c.question.slice(0, 40)}`}
          />
        );
      })}
    </div>
  );
});

export default QuestionDots;