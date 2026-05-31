import { Brain, Wrench, FolderOpen, Search, Sparkles, ArrowUpDown, CheckCircle2 } from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { MnemonicCard, MnemonicStatus } from "./mnemonic-storage";
import type { CategoryRecord } from "@/lib/db-types";
import { List, type RowComponentProps, type ListImperativeAPI } from "react-window";

import InfoPanel from "@/components/InfoPanel";
import WorkshopCardItem from "./workshop/WorkshopCardItem";
import ScrollableRow from "@/components/ScrollableRow";
import { useWorkshopFilters } from "@/hooks/mnemonic/useWorkshopFilters";
import { m, AnimatePresence } from "@/lib/motion";


const COLLAPSED_HEIGHT = 72;
const EXPANDED_BASE = 400;
const GAP = 8;
const VIRTUALIZATION_THRESHOLD = 30;

interface VirtualRowData {
  filteredCards: MnemonicCard[];
  expandedId: string | null;
  onToggle: (id: string) => void;
  onUpdateCard: (id: string, updates: Partial<MnemonicCard>) => void;
  onDeleteCard: (id: string) => void;
  majorSystem: Record<number, string>;
}

function VirtualWorkshopRow(props: RowComponentProps<VirtualRowData>) {
  const { index, style, filteredCards, expandedId, onToggle, onUpdateCard, onDeleteCard, majorSystem } = props;
  const card = filteredCards[index];
  if (!card) return null;

  return (
    <div style={{ ...style, paddingBottom: GAP }}>
      <WorkshopCardItem
        card={card}
        isExpanded={expandedId === card.id}
        onToggle={() => onToggle(card.id)}
        onUpdateCard={onUpdateCard}
        onDeleteCard={onDeleteCard}
        majorSystem={majorSystem}
      />
    </div>
  );
}
interface Props {
  cards: MnemonicCard[];
  onUpdateCard: (id: string, updates: Partial<MnemonicCard>) => void;
  onDeleteCard: (id: string) => void;
  categoryRecords?: CategoryRecord[];
}

const STATUS_FILTERS: { value: MnemonicStatus | "all"; label: string; icon: typeof Sparkles }[] = [
  { value: "all", label: "Sve", icon: Brain },
  { value: "new", label: "Nove", icon: Sparkles },
  { value: "in-workshop", label: "U radionici", icon: Wrench },
  { value: "ready", label: "Spremne", icon: CheckCircle2 },
];

export default function MnemonicWorkshop({ cards, onUpdateCard, onDeleteCard, categoryRecords = [] }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const idToName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of categoryRecords) {
      m[r.id] = r.name;
      for (const sub of (r.subcategories ?? [])) m[sub.id] = sub.name;
    }
    return m;
  }, [categoryRecords]);

  const {
    filterStatus, setFilterStatus,
    selectedCategory, setSelectedCategory,
    selectedSubcategory, setSelectedSubcategory,
    searchQuery, setSearchQuery,
    sortBy, setSortBy,
    debouncedSearch, majorSystem,
    categories, subcategories, filtered, statusCounts, categoryCounts,
  } = useWorkshopFilters({ cards, idToName });

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const listRef = useRef<ListImperativeAPI | null>(null);

  const getRowHeight = useCallback((index: number) => {
    const card = filtered[index];
    if (!card || expandedId !== card.id) return COLLAPSED_HEIGHT + GAP;
    return EXPANDED_BASE + GAP;
  }, [filtered, expandedId]);

  const useVirtualization = filtered.length >= VIRTUALIZATION_THRESHOLD;

  const virtualRowProps = useMemo<VirtualRowData>(() => ({
    filteredCards: filtered,
    expandedId,
    onToggle: handleToggle,
    onUpdateCard,
    onDeleteCard,
    majorSystem,
  }), [filtered, expandedId, handleToggle, onUpdateCard, onDeleteCard, majorSystem]);

  // Reset list when expanded card changes (row heights change).
  useEffect(() => {
    if (listRef.current && expandedId) {
      const idx = filtered.findIndex(c => c.id === expandedId);
      if (idx >= 0) listRef.current.scrollToRow({ index: idx, align: "smart" });
    }
  }, [expandedId, filtered]);



   return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="imperial-title flex items-center gap-3">
            <Wrench className="h-7 w-7 text-primary" /> Radionica mentalnih kuka
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">Kreiraj mentalni video i akronim za svaku mnemo karticu.</p>
        </div>
        <InfoPanel title="Kako radi Mnemo radionica?">
          <p><strong className="text-foreground">Mnemo kuke</strong> — dodaj karticu u radionicu na dva načina: selektuj tekst i klikni „Mnemo kuka", ili koristi ⋯ context menu na kartici u Bazi podataka → „Kloniraj u Mnemo radionicu".</p>
          <p><strong className="text-foreground">Mentalni video</strong> — opiši živopisnu vizuelnu scenu koju povezuješ sa gradivom.</p>
          <p><strong className="text-foreground">Akronim</strong> — za nabrajanja, sistem automatski detektuje stavke i sugeriše prva slova.</p>
          <p><strong className="text-foreground">Major sistem</strong> — brojevi u tekstu se automatski pretvaraju u riječi pomoću fonetskog koda.</p>
          <p><strong className="text-foreground">Statusi</strong> — prati napredak kroz faze: Nova → U radionici → Spremna.</p>
        </InfoPanel>
      </div>

      {/* Filters */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Pretraži mnemo kartice..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="h-px bg-border" />

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <div className="flex gap-1">
            {STATUS_FILTERS.map(sf => {
              const Icon = sf.icon;
              return (
                <button
                  key={sf.value}
                  onClick={() => setFilterStatus(sf.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    filterStatus === sf.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {sf.label}
                  <span className={`text-[10px] px-1 py-0.5 rounded-full ${
                    filterStatus === sf.value ? "bg-primary-foreground/20" : "bg-secondary"
                  }`}>
                    {statusCounts[sf.value]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Category filter */}
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <FolderOpen className="h-3 w-3" /> Predmet
          </span>
          <ScrollableRow>
            <button
              onClick={() => { setSelectedCategory(null); setSelectedSubcategory(null); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                !selectedCategory ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              Sve
            </button>
            {categories.map(cat => {
              const count = categoryCounts.get(cat) ?? 0;
              return (
                <button
                  key={cat}
                  onClick={() => { setSelectedCategory(cat); setSelectedSubcategory(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    selectedCategory === cat ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {idToName[cat] ?? cat}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    selectedCategory === cat ? "bg-primary-foreground/20" : "bg-secondary"
                  }`}>{count}</span>
                </button>
              );
            })}
          </ScrollableRow>

          <AnimatePresence>
            {selectedCategory && subcategories.length > 0 && (
              <m.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
                  <button
                    onClick={() => setSelectedSubcategory(null)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                      !selectedSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    Sve podkat.
                  </button>
                  {subcategories.map(sub => (
                    <button
                      key={sub}
                      onClick={() => setSelectedSubcategory(sub)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                        selectedSubcategory === sub ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      {idToName[sub] ?? sub}
                    </button>
                  ))}
                </ScrollableRow>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Card list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
          {debouncedSearch ? (
            <p>Nema rezultata za „{debouncedSearch}"</p>
          ) : (
            <>
              <p>Nema kartica u ovoj kategoriji.</p>
              <p className="text-sm mt-1">Selektuj tekst u sesiji učenja i klikni „Mnemo kuka" da dodaš karticu.</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{filtered.length} kartica</p>
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
              {(["newest", "status", "category", "success"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    sortBy === s ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {s === "newest" ? "Najnovije" : s === "status" ? "Status" : s === "category" ? "Kategorija" : "Uspješnost"}
                </button>
              ))}
            </div>
          </div>
          {useVirtualization ? (
            <List
              defaultHeight={700}
              rowCount={filtered.length}
              rowHeight={getRowHeight}
              overscanCount={8}
              rowComponent={VirtualWorkshopRow}
              listRef={listRef}
              rowProps={virtualRowProps}
              style={{ height: Math.min(filtered.length * (COLLAPSED_HEIGHT + GAP), 700) }}
            />
          ) : (
            filtered.map(card => (
              <WorkshopCardItem
                key={card.id}
                card={card}
                isExpanded={expandedId === card.id}
                onToggle={() => handleToggle(card.id)}
                onUpdateCard={onUpdateCard}
                onDeleteCard={onDeleteCard}
                majorSystem={majorSystem}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
