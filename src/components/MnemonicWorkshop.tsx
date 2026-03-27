import { ArrowLeft, Brain, Wrench, FolderOpen, Search, Sparkles, ArrowUpDown, CheckCircle2 } from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { MnemonicCard, MnemonicStatus, loadMajorSystem } from "@/lib/mnemonic-storage";


import InfoPanel from "@/components/InfoPanel";
import WorkshopCardItem from "@/components/workshop/WorkshopCardItem";
import ScrollableRow from "@/components/ScrollableRow";
import { useDebounce } from "@/hooks/useDebounce";
import { motion, AnimatePresence } from "framer-motion";
interface Props {
  cards: MnemonicCard[];
  onUpdateCard: (id: string, updates: Partial<MnemonicCard>) => void;
  onDeleteCard: (id: string) => void;
  onBack: () => void;
}

const STATUS_FILTERS: { value: MnemonicStatus | "all"; label: string; icon: typeof Sparkles }[] = [
  { value: "all", label: "Sve", icon: Brain },
  { value: "new", label: "Nove", icon: Sparkles },
  { value: "in-workshop", label: "U radionici", icon: Wrench },
  { value: "ready", label: "Spremne", icon: CheckCircle2 },
];

export default function MnemonicWorkshop({ cards, onUpdateCard, onDeleteCard, onBack }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<MnemonicStatus | "all">("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "status" | "category" | "success">("newest");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const majorSystem = useMemo(() => loadMajorSystem(), []);

  // Build category tree
  const categoryTree = useMemo(() => {
    const tree: Record<string, Set<string>> = {};
    cards.forEach(c => {
      if (!tree[c.category]) tree[c.category] = new Set();
      if (c.subcategory) tree[c.category].add(c.subcategory);
    });
    return tree;
  }, [cards]);

  const categories = useMemo(() => Object.keys(categoryTree).sort(), [categoryTree]);

  // Filter cards
  const filtered = useMemo(() => {
    let result = cards;
    if (filterStatus !== "all") result = result.filter(c => c.mnemonicStatus === filterStatus);
    if (selectedCategory) result = result.filter(c => c.category === selectedCategory);
    if (selectedSubcategory) result = result.filter(c => c.subcategory === selectedSubcategory);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(c =>
        c.question.toLowerCase().includes(q) ||
        c.mnemonicVideo.toLowerCase().includes(q) ||
        c.acronym.toLowerCase().includes(q) ||
        c.sections.some(s => s.content.toLowerCase().includes(q))
      );
    }
    // Sort
    const statusOrder: Record<MnemonicStatus, number> = { "new": 0, "in-workshop": 1, "ready": 2 };
    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case "status":
          return statusOrder[a.mnemonicStatus] - statusOrder[b.mnemonicStatus];
        case "category":
          return a.category.localeCompare(b.category) || (a.subcategory || "").localeCompare(b.subcategory || "");
        case "success": {
          const aRate = a.testCount > 0 ? a.successCount / a.testCount : -1;
          const bRate = b.testCount > 0 ? b.successCount / b.testCount : -1;
          return aRate - bRate; // worst first
        }
        default:
          return b.createdAt - a.createdAt; // newest first
      }
    });
    return sorted;
  }, [cards, filterStatus, selectedCategory, selectedSubcategory, debouncedSearch, sortBy]);

  const subcategories = useMemo(
    () => selectedCategory ? [...(categoryTree[selectedCategory] || [])].sort() : [],
    [selectedCategory, categoryTree]
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const statusCounts = useMemo(() => ({
    all: cards.length,
    new: cards.filter(c => c.mnemonicStatus === "new").length,
    "in-workshop": cards.filter(c => c.mnemonicStatus === "in-workshop").length,
    ready: cards.filter(c => c.mnemonicStatus === "ready").length,
  }), [cards]);

   return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl flex items-center gap-3">
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
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
              const count = cards.filter(c => c.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => { setSelectedCategory(cat); setSelectedSubcategory(null); }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    selectedCategory === cat ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  {cat}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    selectedCategory === cat ? "bg-primary-foreground/20" : "bg-secondary"
                  }`}>{count}</span>
                </button>
              );
            })}
          </ScrollableRow>

          <AnimatePresence>
            {selectedCategory && subcategories.length > 0 && (
              <motion.div
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
                      {sub}
                    </button>
                  ))}
                </ScrollableRow>
              </motion.div>
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
          {filtered.map(card => (
            <WorkshopCardItem
              key={card.id}
              card={card}
              isExpanded={expandedId === card.id}
              onToggle={() => handleToggle(card.id)}
              onUpdateCard={onUpdateCard}
              onDeleteCard={onDeleteCard}
              majorSystem={majorSystem}
            />
          ))}
        </div>
      )}
    </div>
  );
}
