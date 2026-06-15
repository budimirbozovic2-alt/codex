import { Zap } from "lucide-react";
import React from "react";
import { Card, getCardScore } from "@/lib/spaced-repetition";
import { getFrequencyMeta } from "@/lib/sr/frequency";
import { ViewWidth, viewWidthClasses, viewWidthLabels } from "./types";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { SessionChrome } from "@/components/SessionChrome";

const AR_SHORTCUTS = [
  { keys: "Space", description: "Otkrij odgovor" },
  { keys: "1-4", description: "Ocijeni (samo nakon otkrivanja)" },
];

interface Props {
  card: Card;
  currentIndex: number;
  totalCards: number;
  viewWidth: ViewWidth;
  setViewWidth: (w: ViewWidth) => void;
  onBack: () => void;
  hideQuestion?: boolean;
}

const SessionHeader = React.memo(function SessionHeader({
  card, currentIndex, totalCards, viewWidth, setViewWidth, onBack, hideQuestion = false,
}: Props) {
  const score = getCardScore(card);
  const isFlash = card.type === "flash";
  const { categoryRecords } = useCategoryData();
  const catRecord = categoryRecords.find(r => r.id === card.categoryId);
  const catName = catRecord?.name ?? card.categoryId;
  const subName = catRecord?.subcategories?.find(s => s.id === card.subcategoryId)?.name ?? card.subcategoryId;

  return (
    <>
      <SessionChrome
        onBack={onBack}
        modeBadge={(
          <span className="text-xs px-2 py-1 rounded-md bg-secondary text-muted-foreground">
            Aktivno
          </span>
        )}
        viewWidthControl={(
          <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
            {(Object.keys(viewWidthClasses) as ViewWidth[]).map((w) => (
              <button
                key={w}
                onClick={() => setViewWidth(w)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  viewWidth === w ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {viewWidthLabels[w]}
              </button>
            ))}
          </div>
        )}
        progressLabel={`${currentIndex + 1} / ${totalCards}`}
        progressCurrent={currentIndex + 1}
        progressTotal={totalCards}
        shortcuts={AR_SHORTCUTS}
      />

      <div className="rounded-xl bg-card border p-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">{catName}</span>
            {card.subcategoryId && <span className="text-xs text-muted-foreground">› {subName}</span>}
            {isFlash && (
              <span className="text-xs text-primary flex items-center gap-1"><Zap className="h-3 w-3" /> Blic</span>
            )}
            {card.frequencyTag && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${getFrequencyMeta(card.frequencyTag).badgeClass}`}>
                {getFrequencyMeta(card.frequencyTag).label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="px-2 py-1 rounded-md bg-secondary">Snaga: {score}%</span>
            <span className="px-2 py-1 rounded-md bg-secondary">Pročitano: {card.readCount || 0}×</span>
          </div>
        </div>
        {!hideQuestion && (
          <p className="text-xl leading-relaxed">{card.question}</p>
        )}
        {hideQuestion && (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            Pitanje sakriveno — ponovi odgovor na glas iz sjećanja
          </p>
        )}
      </div>
    </>
  );
});

export default SessionHeader;
