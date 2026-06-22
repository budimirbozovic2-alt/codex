import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Pencil, Unlink, Flag, Clock, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { Card, SRSettings } from "@/lib/spaced-repetition";
import { useCardOnlyActions } from "@/hooks/cards/useActions";
import { useCardMutations } from "@/hooks/card/useCardMutations";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import {
  collectLeechInboxItems,
  postponeSection,
  type LeechInboxItem,
} from "@/lib/review/leech-inbox";
import { Button } from "@/components/ui/button";
import { buildQuery } from "@/lib/url-params";
import { SubjectCompactPanel } from "@/components/subject/SubjectCompactPanel";

interface Props {
  cards: Card[];
  srSettings: SRSettings;
  /** When set, only leeches in this category. */
  categoryId?: string;
  maxItems?: number;
  onEditCard?: (card: Card) => void;
  variant?: "default" | "compact" | "embedded";
}

export function LeechInboxPanel({
  cards,
  srSettings,
  categoryId,
  maxItems = 8,
  onEditCard,
  variant = "default",
}: Props) {
  const { patchCard } = useCardOnlyActions();
  const { bulkSetNeedsReview } = useCardMutations();
  const { categoryRecords } = useCategoryData();

  const items = useMemo(() => {
    const scoped = categoryId
      ? cards.filter((c) => c.categoryId === categoryId)
      : cards;
    return collectLeechInboxItems(scoped, srSettings);
  }, [cards, categoryId, srSettings]);

  if (items.length === 0) {
    if (variant === "embedded") {
      return (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nema leech sekcija za ovaj predmet.
        </p>
      );
    }
    return null;
  }

  const visible = items.slice(0, maxItems);
  const catName = (id: string) =>
    categoryRecords.find((r) => r.id === id)?.name ?? id;

  const runAction = async (label: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      toast.success(label);
    } catch {
      toast.error(`${label} — nije uspjelo`);
    }
  };

  const renderActions = (item: LeechInboxItem, compact: boolean) => (
    <div className={compact ? "flex flex-wrap gap-0.5" : "flex flex-wrap gap-1"}>
      {onEditCard ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={compact ? "h-6 text-[9px] gap-0.5 px-1.5" : "h-7 text-[10px] gap-1"}
          onClick={() => onEditCard(item.card)}
        >
          <Pencil className="h-2.5 w-2.5" /> Uredi
        </Button>
      ) : (
        <Button
          asChild
          size="sm"
          variant="outline"
          className={compact ? "h-6 text-[9px] gap-0.5 px-1.5" : "h-7 text-[10px] gap-1"}
        >
          <Link to={`/subject/${item.card.categoryId}/cards`}>
            <Pencil className="h-2.5 w-2.5" /> Uredi
          </Link>
        </Button>
      )}
      {item.card.parentId && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={compact ? "h-6 text-[9px] gap-0.5 px-1.5" : "h-7 text-[10px] gap-1"}
          onClick={() =>
            void runAction("Satelit raskinut od eseja", () => {
              patchCard(item.card.id, (c) => ({ ...c, parentId: undefined }));
            })
          }
        >
          <Unlink className="h-2.5 w-2.5" /> Raskini
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={compact ? "h-6 text-[9px] gap-0.5 px-1.5" : "h-7 text-[10px] gap-1"}
        onClick={() =>
          void runAction("Označeno needsReview", () =>
            bulkSetNeedsReview.mutateAsync([item.card.id]),
          )
        }
      >
        <Flag className="h-2.5 w-2.5" /> Flag
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={compact ? "h-6 text-[9px] gap-0.5 px-1.5" : "h-7 text-[10px] gap-1"}
        onClick={() =>
          void runAction("Odgođeno 7 dana", () => {
            patchCard(item.card.id, (c) =>
              postponeSection(c, item.section.id, 7),
            );
          })
        }
      >
        <Clock className="h-2.5 w-2.5" /> +7d
      </Button>
    </div>
  );

  const reviewLink = (
    <Button asChild size="sm" variant="ghost" className="h-7 text-[10px] px-2 gap-0.5 shrink-0">
      <Link to={`/review${buildQuery({ category: categoryId ?? undefined, mode: "hardest" })}`}>
        Najteža
        <ChevronRight className="h-3 w-3" />
      </Link>
    </Button>
  );

  const listCompact = (compact: boolean) => (
    <ul className="space-y-1.5">
      {visible.map((item) => (
        <li
          key={`${item.card.id}-${item.section.id}`}
          className="rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2 space-y-1.5"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium line-clamp-1" title={item.card.question}>
              {item.card.question || "(Bez pitanja)"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
              {!categoryId && <span>{catName(item.card.categoryId)} · </span>}
              {item.card.type === "flash" ? "Blic" : item.section.title}
              {" · "}
              <span className="text-destructive font-medium">{item.lapses} padova</span>
              {item.parentEssay && (
                <span className="text-muted-foreground/80">
                  {" "}· saga: {item.parentEssay.question?.slice(0, 32) ?? "esej"}
                </span>
              )}
            </p>
          </div>
          {renderActions(item, compact)}
        </li>
      ))}
    </ul>
  );

  if (variant === "embedded") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Problematične sekcije (lapses ≥ prag)
          </p>
          <Button asChild size="sm" variant="outline" className="h-7 text-[10px]">
            <Link to={`/review${buildQuery({ category: categoryId ?? undefined, mode: "hardest" })}`}>
              Konsolidacija → Najteža
            </Link>
          </Button>
        </div>
        {listCompact(true)}
        {items.length > maxItems && (
          <p className="text-[10px] text-muted-foreground">
            + još {items.length - maxItems} leech sekcija
          </p>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <SubjectCompactPanel
        ariaLabel="Leech inbox"
        icon={<AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
        title="Leech"
        trailing={
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            ({items.length})
          </span>
        }
        action={reviewLink}
      >
        {listCompact(true)}
        {items.length > maxItems && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            + još {items.length - maxItems} leech sekcija
          </p>
        )}
      </SubjectCompactPanel>
    );
  }

  return (
    <section className="space-y-3" aria-label="Leech inbox">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold text-destructive uppercase tracking-wider">
            Leech inbox
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">({items.length})</span>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 text-xs">
          <Link to={`/review${buildQuery({ category: categoryId ?? undefined, mode: "hardest" })}`}>
            Konsolidacija → Najteža
          </Link>
        </Button>
      </div>

      <div className="glass-card rounded-xl p-4 border border-destructive/25 bg-destructive/5 space-y-2">
        <p className="text-xs text-muted-foreground">
          Centralna lista problematičnih sekcija (lapses ≥ prag). Saniraj prije masovnog reviewa.
        </p>
        <ul className="space-y-2">
          {visible.map((item) => (
            <li
              key={`${item.card.id}-${item.section.id}`}
              className="rounded-lg border border-destructive/15 bg-background/70 px-3 py-2.5 space-y-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium line-clamp-2" title={item.card.question}>
                  {item.card.question || "(Bez pitanja)"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {!categoryId && (
                    <span>{catName(item.card.categoryId)} · </span>
                  )}
                  {item.card.type === "flash" ? "Blic" : item.section.title}
                  {" · "}
                  <span className="text-destructive font-medium">{item.lapses} padova</span>
                  {item.parentEssay && (
                    <span className="text-muted-foreground/80">
                      {" "}· saga: {item.parentEssay.question?.slice(0, 40) ?? "esej"}
                    </span>
                  )}
                </p>
              </div>
              {renderActions(item, false)}
            </li>
          ))}
        </ul>
        {items.length > maxItems && (
          <p className="text-xs text-muted-foreground">+ još {items.length - maxItems} leech sekcija</p>
        )}
      </div>
    </section>
  );
}
