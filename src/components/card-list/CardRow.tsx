import { memo, useState, lazy, Suspense } from "react";
import { Edit2, Trash2, Scale, ChevronDown, ChevronRight, Zap, Flame } from "lucide-react";
import { Card, getCardScore, getSectionScore, getCardRetrievability, getRetrievability } from "@/lib/spaced-repetition";
import { highlightKeyParts } from "@/lib/highlight-key-parts";
import { format } from "date-fns";
import TextSelectionTooltip from "@/components/TextSelectionTooltip";
import { ScoreBadge, RetentionBadge, SectionBar } from "./CardBadges";
import CardContextMenu from "./CardContextMenu";

const SourceSnippetDialog = lazy(() => import("@/components/SourceSnippetDialog"));

export interface CardRowProps {
  card: Card;
  expanded: boolean;
  highlighted: boolean;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  onExpand: (id: string | null) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  categories?: string[];
  subcategories?: Record<string, string[]>;
  availableChapters?: string[];
  onMoveCategory?: (cardId: string, category: string, subcategory?: string) => void;
  onAssignChapter?: (cardId: string, chapter: string) => void;
  onCloneToMnemonic?: (card: Card) => void;
  onAddKeyPart?: (cardId: string, text: string) => void;
  catNameMap?: Record<string, string>;
}

const CardRow = memo(function CardRow({
  card, expanded, highlighted, selectionMode, selectedIds, onToggleSelect,
  onToggleTag, onExpand, onEdit, onDelete,
  categories, subcategories, availableChapters,
  onMoveCategory, onAssignChapter, onCloneToMnemonic, onAddKeyPart,
  catNameMap,
}: CardRowProps) {
  const score = getCardScore(card);
  const retention = getCardRetrievability(card);
  const isFlash = card.type === "flash";
  const cardTags = card.tags || [];
  const isFrequent = cardTags.includes("često-na-ispitu");
  const hasSource = !!card.sourceId && !!card.originalSourceSnippet;
  const [snippetOpen, setSnippetOpen] = useState(false);

  return (
    <div
      className={`rounded-xl bg-card border hover:border-primary/30 transition-colors overflow-hidden ${highlighted ? "ring-2 ring-primary/50" : ""}`}
      data-card-id={card.id}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {selectionMode && (
            <button
              onClick={() => onToggleSelect?.(card.id)}
              className={`mt-1 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                selectedIds?.has(card.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary"
              }`}
            >
              {selectedIds?.has(card.id) && <span className="text-xs">✓</span>}
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{catNameMap?.[card.categoryId] ?? card.categoryId}</span>
              {card.subcategoryId ? (
                <span className="text-xs text-muted-foreground">› {catNameMap?.["__sub_" + card.subcategoryId] || card.subcategoryId}</span>
              ) : (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">Bez podkat.</span>
              )}
              {card.chapterId && <span className="text-xs text-muted-foreground/70">› {catNameMap?.["__ch_" + card.chapterId] || card.chapterId}</span>}
              <ScoreBadge score={score} />
              <RetentionBadge retention={retention} />
              {isFlash ? (
                <span className="text-xs text-primary flex items-center gap-1"><Zap className="h-3 w-3" /> Blic</span>
              ) : (
                <span className="text-xs text-muted-foreground">{card.sections.length} cjelina</span>
              )}
            </div>
            <p className="text-lg font-medium line-clamp-2">{card.question}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {hasSource && (
              <button
                onClick={() => setSnippetOpen(true)}
                className={`p-2 rounded-lg transition-colors ${card.needsReview ? "text-warning bg-warning/10 hover:bg-warning/20" : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary"}`}
                title={card.needsReview ? "Izvor ažuriran — klikni za poređenje" : "Pogledaj originalni tekst izvora"}
              >
                <Scale className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => onToggleTag(card.id, "često-na-ispitu")} className={`p-2 rounded-lg transition-colors ${isFrequent ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"}`} title={isFrequent ? "Često na ispitu (klikni da ukloniš)" : "Označi kao često na ispitu"}>
              <Flame className="h-4 w-4" />
            </button>
            <CardContextMenu
              card={card}
              categories={categories}
              subcategories={subcategories}
              availableChapters={availableChapters}
              onMoveCategory={onMoveCategory}
              onAssignChapter={onAssignChapter}
              onToggleTag={onToggleTag}
              onCloneToMnemonic={onCloneToMnemonic}
            />
            <button onClick={() => onExpand(expanded ? null : card.id)} className="p-2 hover:bg-secondary rounded-lg">
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            <button onClick={() => onEdit(card)} className="p-2 hover:bg-secondary rounded-lg">
              <Edit2 className="h-4 w-4 text-muted-foreground" />
            </button>
            <button onClick={() => onDelete(card.id)} className="p-2 hover:bg-destructive/10 rounded-lg">
              <Trash2 className="h-4 w-4 text-destructive" />
            </button>
          </div>
        </div>
      </div>

      {hasSource && snippetOpen && (
        <Suspense fallback={null}>
          <SourceSnippetDialog card={card} open={snippetOpen} onOpenChange={setSnippetOpen} />
        </Suspense>
      )}

      {expanded && (
        <TextSelectionTooltip cardId={card.id} question={card.question} category={card.categoryId} subcategoryId={card.subcategoryId} tags={card.tags} keyParts={card.keyParts} onMarkKeyPart={onAddKeyPart ? (text: string) => onAddKeyPart(card.id, text) : undefined}>
          <div className="px-5 pb-5 space-y-3 border-t pt-4 max-h-[60vh] overflow-y-auto">
            {isFlash ? (
              <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: highlightKeyParts(card.sections[0]?.content || "", card.keyParts) }} />
            ) : (
              card.sections.map(s => {
                const sScore = getSectionScore(s);
                const sRetention = getRetrievability(s);
                return (
                  <div key={s.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{s.title}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ScoreBadge score={sScore} />
                        <RetentionBadge retention={sRetention} />
                        <span>S: {s.stability?.toFixed(1) ?? 0}d</span>
                        <span>Sljedeće: {format(new Date(s.nextReview), "dd.MM")}</span>
                      </div>
                    </div>
                    <SectionBar score={sScore} />
                    <div className="text-sm text-muted-foreground line-clamp-2" dangerouslySetInnerHTML={{ __html: highlightKeyParts(s.content, card.keyParts) }} />
                  </div>
                );
              })
            )}
          </div>
        </TextSelectionTooltip>
      )}
    </div>
  );
});

export default CardRow;
