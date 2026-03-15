import { useState } from "react";
import { useCards } from "@/hooks/useCards";
import Dashboard from "@/components/Dashboard";
import CardForm from "@/components/CardForm";
import CardList from "@/components/CardList";
import ReviewSession from "@/components/ReviewSession";
import LearnSession from "@/components/LearnSession";
import CategoryManager from "@/components/CategoryManager";
import DocxImporter from "@/components/DocxImporter";
import SRSettingsPanel from "@/components/SRSettingsPanel";
import { Card } from "@/lib/spaced-repetition";
import { Plus, BookOpen, Home, Moon, Sun, FolderOpen, GraduationCap, Download, Upload, FileText, Settings, Brain, Search, Flame, CheckSquare, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

type View = "dashboard" | "create" | "edit" | "cards" | "review" | "categories" | "learn" | "settings";

const Index = () => {
  const {
    cards, categories, subcategories, dueCards, stats, categoryStats, cardCountByCategory, reviewLog, srSettings,
    addCard, addFlashCard, updateCard, deleteCard, splitCard, reviewSection, markRead, toggleTag, bulkUpdateSubcategory,
    exportData, importData, importCards,
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    updateSRSettings,
  } = useCards();
  const [docxOpen, setDocxOpen] = useState(false);
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
    { key: "review" as View, icon: Brain, label: "Ponavljaj", badge: stats.due > 0 ? stats.due : undefined },
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
          <button onClick={() => setView("settings")} className={`p-2 rounded-lg hover:bg-secondary transition-colors ${view === "settings" ? "text-primary" : "text-muted-foreground"}`} title="Podešavanja">
            <Settings className="h-4 w-4" />
          </button>
          <button onClick={() => setDocxOpen(true)} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="Uvezi iz DOCX">
            <FileText className="h-4 w-4" />
          </button>
          <label className="p-2 rounded-lg hover:bg-secondary text-muted-foreground cursor-pointer" title="Uvezi JSON backup">
            <Upload className="h-4 w-4" />
            <input type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ""; }} />
          </label>
          <button onClick={exportData} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="Izvezi backup">
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
              <Dashboard stats={stats} categoryStats={categoryStats} categories={categories} cards={cards} reviewLog={reviewLog} srSettings={srSettings} onExport={exportData} />
            </motion.div>
          )}
          {view === "review" && (
            <motion.div key="review" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ReviewSession dueCards={dueCards} srSettings={srSettings} onReviewSection={reviewSection} onBack={() => setView("dashboard")} />
            </motion.div>
          )}
          {view === "learn" && (
            <motion.div key="learn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LearnSession cards={cards} categories={categories} subcategories={subcategories} onMarkRead={markRead} onBack={() => setView("dashboard")} />
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
              <SRSettingsPanel settings={srSettings} onUpdate={updateSRSettings} onBack={() => setView("dashboard")} />
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

                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pretraži kartice..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Type filter */}
                <div className="flex gap-2 flex-wrap">
                  {(["all", "essay", "flash"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilterType(t)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterType === t ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
                    >
                      {t === "all" ? "Sve" : t === "essay" ? "Esejska" : "Blic"}
                    </button>
                  ))}
                </div>

                {/* Category filter */}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { setFilterCategory(null); setFilterSubcategory(null); }} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!filterCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    Sve kategorije
                  </button>
                  {categories.map((c) => (
                    <button key={c} onClick={() => { setFilterCategory(c); setFilterSubcategory(null); }} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterCategory === c ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                      {c}
                    </button>
                  ))}
                </div>

                {/* Subcategory filter */}
                {filterCategory && availableSubcategories.length > 0 && (
                  <div className="flex gap-2 flex-wrap pl-4">
                    <button onClick={() => setFilterSubcategory(null)} className={`px-2.5 py-1 rounded-md text-xs transition-colors ${!filterSubcategory ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                      Sve podkat.
                    </button>
                    {availableSubcategories.map((sc) => (
                      <button key={sc} onClick={() => setFilterSubcategory(sc)} className={`px-2.5 py-1 rounded-md text-xs transition-colors ${filterSubcategory === sc ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                        {sc}
                      </button>
                    ))}
                  </div>
                )}
                {/* Tag filter */}
                <div className="flex gap-2 flex-wrap items-center">
                  <Flame className="h-3.5 w-3.5 text-muted-foreground" />
                  <button onClick={() => setFilterTag(null)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${!filterTag ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    Sve
                  </button>
                  <button onClick={() => setFilterTag(filterTag === "često-na-ispitu" ? null : "često-na-ispitu")} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filterTag === "često-na-ispitu" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
                    Često na ispitu
                  </button>
                </div>

                <CardList cards={cards} filterCategory={filterCategory} filterSubcategory={filterSubcategory} filterType={filterType} filterTag={filterTag} searchQuery={searchQuery} onEdit={handleEdit} onDelete={deleteCard} onToggleTag={toggleTag} scrollToCardId={scrollToCardId} onScrolledTo={() => setScrollToCardId(null)} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
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
    </div>
  );
};

export default Index;
