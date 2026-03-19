import { Card, getCardScore, getSectionScore, getCardRetrievability, getRetrievability } from "@/lib/spaced-repetition";
import { format } from "date-fns";
import { Edit2, Trash2, ChevronDown, ChevronRight, Zap, Brain, Flame } from "lucide-react";
import { useState, useRef, useEffect, useMemo, CSSProperties } from "react";
import { List } from "react-window";

interface Props {
  cards: Card[];
  filterCategory: string | null;
  filterSubcategory?: string | null;
  filterType?: "all" | "essay" | "flash";
  filterTag?: string | null;
  searchQuery?: string;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  scrollToCardId?: string | null;
  onScrolledTo?: () => void;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-success bg-success/10" : score >= 40 ? "text-warning bg-warning/10" : "text-destructive bg-destructive/10";
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${color}`}>{score}%</span>;
}

function RetentionBadge({ retention }: { retention: number }) {
  if (retention === 0) return null;
  const color = retention >= 90 ? "text-success" : retention >= 70 ? "text-warning" : "text-destructive";
  return (
    <span className={`text-xs flex items-center gap-0.5 ${color}`} title="Vjerovatnoća prisjećanja">
      <Brain className="h-3 w-3" />{retention}%
    </span>
  );
}

function SectionBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-success" : score >= 40 ? "bg-warning" : score > 0 ? "bg-destructive" : "bg-muted-foreground/30";
  return (
    <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(score, 5)}%` }} />
    </div>
  );
}

const ROW_HEIGHT = 100;
const VIRTUALIZATION_THRESHOLD = 50;

interface CardRowProps {
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
}

function CardRowInner({ card, expanded, highlighted, selectionMode, selectedIds, onToggleSelect, onToggleTag, onExpand, onEdit, onDelete }: CardRowProps) {
  const score = getCardScore(card);
  const retention = getCardRetrievability(card);
  const isFlash = card.type === "flash";
  const cardTags = card.tags || [];
  const isFrequent = cardTags.includes("često-na-ispitu");

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
              <span className="text-xs uppercase tracking-widest text-muted-foreground">{card.category}</span>
              {card.subcategory && <span className="text-xs text-muted-foreground">› {card.subcategory}</span>}
              <ScoreBadge score={score} />
              <RetentionBadge retention={retention} />
              {isFlash ? (
                <span className="text-xs text-primary flex items-center gap-1"><Zap className="h-3 w-3" /> Blic</span>
              ) : (
                <span className="text-xs text-muted-foreground">{card.sections.length} cjelina</span>
              )}
            </div>
            <p className="font-serif text-lg line-clamp-2">{card.question}</p>
          </div>
          <div className="flex gap-1">
            <button onClick={() => onToggleTag(card.id, "često-na-ispitu")} className={`p-2 rounded-lg transition-colors ${isFrequent ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"}`} title={isFrequent ? "Često na ispitu (klikni da ukloniš)" : "Označi kao često na ispitu"}>
              <Flame className="h-4 w-4" />
            </button>
            <button onClick={() => onToggleTag(card.id, "memorizacija")} className={`p-2 rounded-lg transition-colors ${cardTags.includes("memorizacija") ? "text-primary bg-primary/10 hover:bg-primary/20" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary"}`} title={cardTags.includes("memorizacija") ? "Memorizacija (klikni da ukloniš)" : "Dodaj u Memorizaciju"}>
              <Brain className="h-4 w-4" />
            </button>
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

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t pt-4">
          {isFlash ? (
            <div className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: card.sections[0]?.content || "" }} />
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
                  <div className="text-sm text-muted-foreground line-clamp-2" dangerouslySetInnerHTML={{ __html: s.content }} />
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// Row component for react-window virtualization
interface VirtualRowProps {
  filteredCards: Card[];
  expandedId: string | null;
  scrollToCardId?: string | null;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleTag: (cardId: string, tag: string) => void;
  onExpand: (id: string | null) => void;
  onEdit: (card: Card) => void;
  onDelete: (id: string) => void;
}

function VirtualRow({ index, style, ...rowProps }: { index: number; style: CSSProperties; ariaAttributes: any } & VirtualRowProps) {
  const { filteredCards, expandedId, scrollToCardId, selectionMode, selectedIds, onToggleSelect, onToggleTag, onExpand, onEdit, onDelete } = rowProps;
  const card = filteredCards[index];
  if (!card) return null;

  return (
    <div style={{ ...style, paddingBottom: 12 }}>
      <CardRowInner
        card={card}
        expanded={expandedId === card.id}
        highlighted={scrollToCardId === card.id}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={onToggleSelect}
        onToggleTag={onToggleTag}
        onExpand={onExpand}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

export default function CardList({
  cards, filterCategory, filterSubcategory, filterType = "all", filterTag, searchQuery = "",
  onEdit, onDelete, onToggleTag, scrollToCardId, onScrolledTo,
  selectionMode, selectedIds, onToggleSelect,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [containerWidth, setContainerWidth] = useState(800);
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const filtered = useMemo(() => {
    let result = filterCategory ? cards.filter(c => c.category === filterCategory) : cards;
    if (filterSubcategory) result = result.filter(c => c.subcategory === filterSubcategory);
    if (filterType !== "all") result = result.filter(c => (c.type || "essay") === filterType);
    if (filterTag) result = result.filter(c => (c.tags || []).includes(filterTag));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => {
        const questionMatch = c.question.toLowerCase().includes(q);
        const contentMatch = c.sections.some(s => {
          const plain = s.content.replace(/<[^>]*>/g, "").toLowerCase();
          return plain.includes(q) || s.title.toLowerCase().includes(q);
        });
        return questionMatch || contentMatch;
      });
    }
    return result;
  }, [cards, filterCategory, filterSubcategory, filterType, filterTag, searchQuery]);

  useEffect(() => {
    if (scrollToCardId) onScrolledTo?.();
  }, [scrollToCardId, onScrolledTo]);

  const useVirtualization = filtered.length >= VIRTUALIZATION_THRESHOLD;

  if (filtered.length === 0) {
    return <p className="text-muted-foreground text-center py-12">Nema kartica. Kreirajte prvu!</p>;
  }

  if (useVirtualization) {
    return (
      <div ref={containerRef}>
        <List
          height={Math.min(filtered.length * ROW_HEIGHT, 700)}
          rowCount={filtered.length}
          rowHeight={ROW_HEIGHT}
          overscanCount={5}
          rowComponent={VirtualRow}
          rowProps={{
            filteredCards: filtered,
            expandedId,
            scrollToCardId,
            selectionMode,
            selectedIds,
            onToggleSelect,
            onToggleTag,
            onExpand: setExpandedId,
            onEdit,
            onDelete,
          } as any}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-3">
      {filtered.map(card => (
        <CardRowInner
          key={card.id}
          card={card}
          expanded={expandedId === card.id}
          highlighted={scrollToCardId === card.id}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onToggleTag={onToggleTag}
          onExpand={setExpandedId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
