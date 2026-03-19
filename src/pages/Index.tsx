import { useState, useEffect, useCallback } from "react";

import { useCards } from "@/hooks/useCards";
import Dashboard from "@/components/Dashboard";
import CardForm from "@/components/CardForm";
import CardList from "@/components/CardList";
import ScrollableRow from "@/components/ScrollableRow";
import ReviewSession from "@/components/ReviewSession";
import LearnSession from "@/components/LearnSession";
import CategoryManager from "@/components/CategoryManager";
import DocxImporter from "@/components/DocxImporter";
import KnowledgeMap from "@/components/KnowledgeMap";
import SRSettingsPanel from "@/components/SRSettingsPanel";
import MnemonicModule from "@/components/MnemonicModule";
import MetacognitiveCenter from "@/components/MetacognitiveCenter";
import MyStats from "@/components/MyStats";
import MajorSystemSettings from "@/components/MajorSystemSettings";
import StrategicPlanner from "@/components/StrategicPlanner";
import FrequentErrors from "@/pages/FrequentErrors";
import ExportImportDialog from "@/components/ExportImportDialog";
import ZenMode from "@/components/ZenMode";
import GlobalSearch from "@/components/GlobalSearch";
import EmptyState from "@/components/EmptyState";
import { Card } from "@/lib/spaced-repetition";
import { createMnemonicCard, loadMnemonicCards, saveMnemonicCards } from "@/lib/mnemonic-storage";
import { recordAppEntry, recordFirstAction } from "@/lib/metacognitive-storage";
import { Plus, BookOpen, Home, Moon, Sun, FolderOpen, GraduationCap, Download, Upload, FileText, Settings, Brain, Search, Flame, CheckSquare, X, LayoutGrid, Focus, RotateCcw, BarChart3, Target } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type View = "dashboard" | "create" | "edit" | "cards" | "review" | "categories" | "learn" | "settings" | "frequent-errors" | "knowledge-map" | "mnemonic" | "major-system-settings" | "metacognitive" | "stats" | "planner";

const Index = () => {
  const {
    cards, categories, subcategories, dueCards, stats, categoryStats, cardCountByCategory, reviewLog, srSettings,
    addCard, addFlashCard, updateCard, deleteCard, splitCard, reviewSection, markRead, toggleTag, bulkUpdateSubcategory, logError, clearErrorLog,
    exportData, exportTemplate, importData, importCards,
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    updateSRSettings,
  } = useCards();
  const [docxOpen, setDocxOpen] = useState(false);
  const [exportImportOpen, setExportImportOpen] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [scrollToCardId, setScrollToCardId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterSubcategory, setFilterSubcategory] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash">("all");
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSubcategory, setBulkSubcategory] = useState("");
  const [zenMode, setZenMode] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  // Mnemonic cloning: when "memorizacija" tag is toggled ON, clone card to mnemonic_cards
  const handleToggleTag = useCallback((cardId: string, tag: string) => {
    toggleTag(cardId, tag);
    if (tag === "memorizacija") {
      const card = cards.find(c => c.id === cardId);
      if (card && !(card.tags || []).includes("memorizacija")) {
        // Tag is being added — clone to mnemonic store
        const mnemonicCards = loadMnemonicCards();
        const alreadyCloned = mnemonicCards.some(mc => mc.originalCardId === cardId);
        if (!alreadyCloned) {
          const clone = createMnemonicCard(
            cardId,
            card.question,
            card.sections.map(s => ({ title: s.title, content: s.content })),
            card.category,
            card.subcategory,
            (card.tags || []).filter(t => t !== "memorizacija"),
          );
          saveMnemonicCards([...mnemonicCards, clone]);
        }
      } else if (card && (card.tags || []).includes("memorizacija")) {
        // Tag is being removed — remove clone
        const mnemonicCards = loadMnemonicCards();
        saveMnemonicCards(mnemonicCards.filter(mc => mc.originalCardId !== cardId));
      }
    }
  }, [toggleTag, cards]);

  // Send lapse card to Mnemonic Workshop
  const handleSendToWorkshop = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (!card) return;
    // Add "memorizacija" tag if not present
    if (!(card.tags || []).includes("memorizacija")) {
      toggleTag(cardId, "memorizacija");
      // Clone to mnemonic store
      const mnemonicCards = loadMnemonicCards();
      const alreadyCloned = mnemonicCards.some(mc => mc.originalCardId === cardId);
      if (!alreadyCloned) {
        const clone = createMnemonicCard(
          cardId,
          card.question,
          card.sections.map(s => ({ title: s.title, content: s.content })),
          card.category,
          card.subcategory,
          (card.tags || []).filter(t => t !== "memorizacija"),
        );
        saveMnemonicCards([...mnemonicCards, clone]);
      }
    }
    setView("mnemonic");
  }, [cards, toggleTag]);
  useEffect(() => { recordAppEntry(); }, []);

  // Track first learning action (Slippage)
  useEffect(() => {
    if (view === "review" || view === "learn") recordFirstAction();
  }, [view]);

  // Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setGlobalSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkApply = () => {
    if (selectedIds.size === 0 || !bulkSubcategory || !filterCategory) return;
    bulkUpdateSubcategory(Array.from(selectedIds), bulkSubcategory);
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkSubcategory("");
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkSubcategory("");
  };

  const bulkSubcats = filterCategory ? (subcategories[filterCategory] || []) : [];

  const toggleDark = () => {
    document.documentElement.classList.toggle("dark");
    setDark((d) => !d);
  };

  const handleEdit = (card: Card) => {
    setEditingCard(card);
    setView("edit");
  };

  const navItems = [
    { key: "dashboard" as View, icon: Home, label: "Početna" },
    { key: "learn" as View, icon: GraduationCap, label: "Uči" },
    { key: "review" as View, icon: RotateCcw, label: "Ponavljaj", badge: stats.due > 0 ? stats.due : undefined },
    { key: "mnemonic" as View, icon: Brain, label: "Memo" },
    { key: "stats" as View, icon: BarChart3, label: "Statistike" },
    { key: "planner" as View, icon: Target, label: "Planer" },
    { key: "cards" as View, icon: BookOpen, label: "Kartice" },
    { key: "categories" as View, icon: FolderOpen, label: "Kategorije" },
  ];

  const availableSubcategories = filterCategory ? (subcategories[filterCategory] || []) : [];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-serif italic tracking-tight text-primary cursor-pointer" onClick={() => setView("dashboard")}>Memoria</h1>
          <nav className="hidden md:flex gap-1">
            {navItems.map(({ key, icon: Icon, label, badge }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {badge !== undefined && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {(view === "review" || view === "learn") && (
            <button onClick={() => setZenMode(!zenMode)} className={`p-2 rounded-lg hover:bg-secondary transition-colors ${zenMode ? "text-primary bg-primary/10" : "text-muted-foreground"}`} title="Zen Mode">
              <Focus className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setView("settings")} className={`p-2 rounded-lg hover:bg-secondary transition-colors ${view === "settings" ? "text-primary" : "text-muted-foreground"}`} title="Podešavanja">
            <Settings className="h-4 w-4" />
          </button>
          <button onClick={() => setDocxOpen(true)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="Uvezi iz DOCX">
            <FileText className="h-4 w-4" />
          </button>
          <button onClick={() => setGlobalSearchOpen(true)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="Pretraži (Ctrl+K)">
            <Search className="h-4 w-4" />
          </button>
          <button onClick={() => setExportImportOpen(true)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="Export / Import">
            <Download className="h-4 w-4" />
          </button>
          <button onClick={toggleDark} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {view === "dashboard" && (
            <motion.div key="dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {cards.length === 0 ? (
                <EmptyState type="dashboard" onAction={() => setView("create")} />
              ) : (
                <Dashboard stats={stats} categoryStats={categoryStats} categories={categories} subcategories={subcategories} cards={cards} reviewLog={reviewLog} srSettings={srSettings} onExport={() => setExportImportOpen(true)} onStartReview={() => setView("review")} />
              )}
            </motion.div>
          )}
          {view === "review" && (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {dueCards.length === 0 ? (
                <EmptyState type="review" />
              ) : (
                <ReviewSession dueCards={dueCards} subcategories={subcategories} srSettings={srSettings} onReviewSection={reviewSection} onLogError={logError} onBack={() => setView("dashboard")} />
              )}
            </motion.div>
          )}
          {view === "learn" && (
            <motion.div key="learn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LearnSession cards={cards} categories={categories} subcategories={subcategories} onMarkRead={markRead} onReviewSection={reviewSection} onBack={() => setView("dashboard")} dueCount={stats.due} />
            </motion.div>
          )}
          {(view === "create" || view === "edit") && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CardForm
                categories={categories}
                subcategories={subcategories}
                onSave={(q, s, c, sub) => { addCard(q, s, c, sub); setView("cards"); }}
                onSaveFlash={(q, a, c, sub) => { addFlashCard(q, a, c, sub); setView("cards"); }}
                onCancel={() => { setView("dashboard"); setEditingCard(null); }}
                editCard={view === "edit" ? editingCard : null}
                onUpdate={(id, u) => { updateCard(id, u); setScrollToCardId(id); setView("cards"); setEditingCard(null); }}
              />
            </motion.div>
          )}
          {view === "categories" && (
            <motion.div key="categories" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CategoryManager
                categories={categories}
                subcategories={subcategories}
                cardCountByCategory={cardCountByCategory}
                onAdd={addCategory}
                onRename={renameCategory}
                onDelete={deleteCategory}
                onAddSub={addSubcategory}
                onRenameSub={renameSubcategory}
                onDeleteSub={deleteSubcategory}
                onClose={() => setView("dashboard")}
              />
            </motion.div>
          )}
          {view === "settings" && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <SRSettingsPanel settings={srSettings} onUpdate={updateSRSettings} onBack={() => setView("dashboard")} onOpenMajorSystem={() => setView("major-system-settings")} />
            </motion.div>
          )}
          {view === "frequent-errors" && (
            <motion.div key="errors" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FrequentErrors cards={cards} onBack={() => setView("dashboard")} onClearErrorLog={clearErrorLog} />
            </motion.div>
          )}
          {view === "knowledge-map" && (
            <motion.div key="kmap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <KnowledgeMap cards={cards} categories={categories} subcategories={subcategories} onBack={() => setView("dashboard")} />
            </motion.div>
          )}
          {view === "mnemonic" && (
            <motion.div key="mnemonic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MnemonicModule onBack={() => setView("dashboard")} />
            </motion.div>
          )}
          {view === "metacognitive" && (
            <motion.div key="metacognitive" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MetacognitiveCenter cards={cards} categories={categories} reviewLog={reviewLog} onBack={() => setView("stats")} settings={srSettings} onSendToWorkshop={handleSendToWorkshop} />
            </motion.div>
          )}
          {view === "stats" && (
            <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MyStats cards={cards} categories={categories} subcategories={subcategories} categoryStats={categoryStats} reviewLog={reviewLog} srSettings={srSettings} onBack={() => setView("dashboard")} onShowKnowledgeMap={() => setView("knowledge-map")} onSendToWorkshop={handleSendToWorkshop} />
            </motion.div>
          )}
          {view === "planner" && (
            <motion.div key="planner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <StrategicPlanner cards={cards} categories={categories} reviewLog={reviewLog} onBack={() => setView("dashboard")} />
            </motion.div>
          {view === "major-system-settings" && (
            <motion.div key="major-settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MajorSystemSettings onBack={() => setView("settings")} />
            </motion.div>
          )}
          {view === "cards" && (
            <motion.div key="cards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-serif">Kartice</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${selectionMode ? "bg-secondary text-secondary-foreground" : "border text-muted-foreground hover:bg-secondary"}`}
                    >
                      {selectionMode ? <><X className="h-4 w-4" /> Otkaži</> : <><CheckSquare className="h-4 w-4" /> Označi</>}
                    </button>
                    <button onClick={() => setView("create")} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm hover:opacity-90 transition-opacity">
                      <Plus className="h-4 w-4" /> Nova
                    </button>
                  </div>
                </div>

                {/* Bulk action bar */}
                {selectionMode && (
                  <div className="flex items-center gap-3 flex-wrap p-4 rounded-xl bg-secondary/50 border">
                    <span className="text-sm font-medium">{selectedIds.size} označeno</span>
                    <button
                      onClick={() => {
                        const allFiltered = cards.filter((c) => {
                          if (filterCategory && c.category !== filterCategory) return false;
                          if (filterSubcategory && c.subcategory !== filterSubcategory) return false;
                          return true;
                        });
                        setSelectedIds(new Set(allFiltered.map((c) => c.id)));
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Označi sve
                    </button>
                    <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:underline">
                      Poništi
                    </button>
                    <div className="flex-1" />
                    {!filterCategory ? (
                      <span className="text-xs text-muted-foreground">Filtriraj po kategoriji da bi dodijelio podkategoriju</span>
                    ) : bulkSubcats.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Nema podkategorija za "{filterCategory}"</span>
                    ) : (
                      <>
                        <select
                          value={bulkSubcategory}
                          onChange={(e) => setBulkSubcategory(e.target.value)}
                          className="px-3 py-1.5 rounded-lg border bg-background text-sm"
                        >
                          <option value="">Podkategorija...</option>
                          {bulkSubcats.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
                        </select>
                        <button
                          onClick={handleBulkApply}
                          disabled={selectedIds.size === 0 || !bulkSubcategory}
                          className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
                        >
                          Primijeni
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Filters panel */}
                <div className="rounded-xl border bg-card p-5 space-y-4">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Pretraži kartice..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  <div className="h-px bg-border" />

                  {/* Type + Tag row */}
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tip</span>
                      <div className="flex gap-1">
                        {(["all", "essay", "flash"] as const).map((t) => (
                          <button
                            key={t}
                            onClick={() => setFilterType(t)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterType === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                          >
                            {t === "all" ? "Sve" : t === "essay" ? "Esejska" : "Blic"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="w-px h-6 bg-border hidden sm:block" />

                    <div className="flex items-center gap-2">
                      <Flame className="h-3.5 w-3.5 text-muted-foreground" />
                      <div className="flex gap-1">
                        <button onClick={() => setFilterTag(null)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${!filterTag ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                          Sve
                        </button>
                        <button onClick={() => setFilterTag(filterTag === "često-na-ispitu" ? null : "često-na-ispitu")} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filterTag === "často-na-ispitu" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                          Često na ispitu
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Categories */}
                  <div className="space-y-2.5">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Kategorija</span>
                    <ScrollableRow>
                      <button onClick={() => { setFilterCategory(null); setFilterSubcategory(null); }} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${!filterCategory ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                        Sve
                      </button>
                      {categories.map((c) => {
                        const count = cards.filter((card) => card.category === c).length;
                        return (
                          <button
                            key={c}
                            onClick={() => { setFilterCategory(c); setFilterSubcategory(null); }}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${filterCategory === c ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                          >
                            {c}
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${filterCategory === c ? "bg-primary-foreground/20" : "bg-secondary"}`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </ScrollableRow>

                    {/* Subcategories */}
                    {filterCategory && availableSubcategories.length > 0 && (
                      <ScrollableRow className="pl-3 border-l-2 border-primary/20 ml-1">
                        <button onClick={() => setFilterSubcategory(null)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${!filterSubcategory ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                          Sve podkat.
                        </button>
                        {availableSubcategories.map((sc) => (
                          <button key={sc} onClick={() => setFilterSubcategory(sc)} className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${filterSubcategory === sc ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                            {sc}
                          </button>
                        ))}
                      </ScrollableRow>
                    )}
                  </div>
                </div>

                <CardList cards={cards} filterCategory={filterCategory} filterSubcategory={filterSubcategory} filterType={filterType} filterTag={filterTag} searchQuery={searchQuery} onEdit={handleEdit} onDelete={deleteCard} onToggleTag={handleToggleTag} scrollToCardId={scrollToCardId} onScrolledTo={() => setScrollToCardId(null)} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <nav className="md:hidden border-t flex justify-around py-3 bg-background">
        {navItems.map(({ key, icon: Icon, label, badge }) => (
          <button key={key} onClick={() => setView(key)} className={`relative flex flex-col items-center gap-1 text-xs transition-colors ${view === key ? "text-primary" : "text-muted-foreground"}`}>
            <Icon className="h-5 w-5" />
            {label}
            {badge !== undefined && (
              <span className="absolute -top-1 right-0 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <DocxImporter
        open={docxOpen}
        onClose={() => setDocxOpen(false)}
        categories={categories}
        onImport={(cards, cat, cardType) => {
          if (cardType === "flash") {
            cards.forEach((c) => {
              const answer = c.sections.map((s) => s.content).join("\n");
              addFlashCard(c.question, answer, cat);
            });
          } else {
            importCards(cards, cat);
          }
          setDocxOpen(false);
        }}
      />

      <ExportImportDialog
        open={exportImportOpen}
        onOpenChange={setExportImportOpen}
        onExportTemplate={exportTemplate}
        onExportFull={exportData}
        onImport={importData}
        cards={cards}
      />

      <AnimatePresence>
        <ZenMode active={zenMode} onToggle={() => setZenMode(false)} />
      </AnimatePresence>

      <GlobalSearch
        cards={cards}
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onNavigateToCard={(card) => {
          handleEdit(card);
        }}
      />
    </div>
  );
};

export default Index;
