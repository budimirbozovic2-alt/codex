import { useMemo, useState } from "react";
import { Layers, Plus, Unlink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Card } from "@/lib/spaced-repetition";
import {
  useCardsByCategory,
  useCardsByArticle,
} from "@/hooks/card/useCardsQuery";
import { LinkCardsToArticleDialog } from "./LinkCardsToArticleDialog";

interface Props {
  subjectId: string;
  articleId: string;
  articleTitle: string;
  /** Open a card for editing. */
  onOpenCard: (card: Card) => void;
  /** Attach the chosen cards to this article. */
  onLink: (cardIds: string[]) => void;
  /** Detach a single card from this article. */
  onUnlink: (cardId: string) => void;
}

/**
 * "Kartice o ovom pojmu" — surfaces the spaced-repetition cards linked to the
 * active Zettelkasten article, closing the loop between passive wiki reading
 * and active recall. Cards can be opened, detached, or attached in bulk.
 */
export function LinkedCardsPanel({
  subjectId,
  articleId,
  articleTitle,
  onOpenCard,
  onLink,
  onUnlink,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const subjectCards = useCardsByCategory(subjectId);
  const linkedCards = useCardsByArticle(subjectId, articleId);

  const candidates = useMemo(
    () => subjectCards.filter((c) => c.linkedArticleId !== articleId),
    [subjectCards, articleId],
  );

  return (
    <div className="rounded-lg border border-hairline bg-card/40">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-hairline">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Layers className="h-3.5 w-3.5 text-primary" />
          Kartice o ovom pojmu
          {linkedCards.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
              {linkedCards.length}
            </span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setPickerOpen(true)}
        >
          <Plus className="h-3 w-3" /> Poveži kartice
        </Button>
      </div>

      {linkedCards.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          Nijedna kartica još nije povezana s ovim pojmom. Povežite postojeće
          kartice da povežete čitanje s aktivnim prisjećanjem.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {linkedCards.map((card) => (
            <li
              key={card.id}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="text-[10px] text-muted-foreground shrink-0 w-7">
                {card.type === "flash" ? "blic" : "esej"}
              </span>
              <button
                type="button"
                onClick={() => onOpenCard(card)}
                className="flex-1 min-w-0 text-left hover:text-primary transition-colors"
                title="Otvori karticu"
              >
                <span className="line-clamp-1">
                  {card.question || "(Bez pitanja)"}
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground"
                onClick={() => onOpenCard(card)}
                title="Uredi karticu"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onUnlink(card.id)}
                title="Ukloni vezu"
              >
                <Unlink className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <LinkCardsToArticleDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        articleTitle={articleTitle}
        candidates={candidates}
        onLink={onLink}
      />
    </div>
  );
}

export default LinkedCardsPanel;
