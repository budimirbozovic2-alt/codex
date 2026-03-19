import { ReactNode, useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { useAppContext } from "@/contexts/AppContext";
import PomodoroTimer from "@/components/PomodoroTimer";
import DocxImporter from "@/components/DocxImporter";
import ExportImportDialog from "@/components/ExportImportDialog";
import ZenMode from "@/components/ZenMode";
import GlobalSearch from "@/components/GlobalSearch";
import { BookOpen, Home, Moon, Sun, FolderOpen, GraduationCap, Download, FileText, Settings, Brain, Search, Focus, RotateCcw, BarChart3, Target } from "lucide-react";
import { AnimatePresence } from "framer-motion";

const NAV_ITEMS: { path: string; icon: typeof Home; label: string }[] = [
  { path: "/", icon: Home, label: "Početna" },
  { path: "/learn", icon: GraduationCap, label: "Uči" },
  { path: "/review", icon: RotateCcw, label: "Ponavljaj" },
  { path: "/mnemonic", icon: Brain, label: "Memo" },
  { path: "/stats", icon: BarChart3, label: "Statistike" },
  { path: "/planner", icon: Target, label: "Planer" },
  { path: "/cards", icon: BookOpen, label: "Kartice" },
  { path: "/categories", icon: FolderOpen, label: "Kategorije" },
];

export default function MainLayout({ children }: { children: ReactNode }) {
  const ctx = useAppContext();
  const { setView, setEditingCard, stats, cards, categories, exportData, exportTemplate, importData, importCards, addFlashCard } = ctx;
  const { pathname } = useLocation();

  const [docxOpen, setDocxOpen] = useState(false);
  const [exportImportOpen, setExportImportOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setGlobalSearchOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleDark = useCallback(() => {
    document.documentElement.classList.toggle("dark");
    setDark(d => !d);
  }, []);

  const isReviewOrLearn = pathname === "/review" || pathname === "/learn";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-serif italic tracking-tight text-primary cursor-pointer" onClick={() => setView("dashboard")}>
            Memoria
          </h1>
          <nav className="hidden md:flex gap-1">
            {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
              const isActive = pathname === path;
              const badge = path === "/review" && stats.due > 0 ? stats.due : undefined;
              return (
                <button
                  key={path}
                  onClick={() => setView(path === "/" ? "dashboard" : path.slice(1) as any)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
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
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <PomodoroTimer compact />
          <div className="w-px h-5 bg-border mx-1" />
          {isReviewOrLearn && (
            <button onClick={() => setZenMode(!zenMode)} className={`p-2 rounded-lg hover:bg-secondary transition-colors ${zenMode ? "text-primary bg-primary/10" : "text-muted-foreground"}`} title="Zen Mode">
              <Focus className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setView("settings")} className={`p-2 rounded-lg hover:bg-secondary transition-colors ${pathname === "/settings" ? "text-primary" : "text-muted-foreground"}`} title="Podešavanja">
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
        {children}
      </main>

      <nav className="md:hidden border-t flex justify-around py-3 bg-background">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => {
          const isActive = pathname === path;
          const badge = path === "/review" && stats.due > 0 ? stats.due : undefined;
          return (
            <button
              key={path}
              onClick={() => setView(path === "/" ? "dashboard" : path.slice(1) as any)}
              className={`relative flex flex-col items-center gap-1 text-xs transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
            >
              <Icon className="h-5 w-5" />
              {label}
              {badge !== undefined && (
                <span className="absolute -top-1 right-0 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <DocxImporter
        open={docxOpen}
        onClose={() => setDocxOpen(false)}
        categories={categories}
        onImport={(docxCards, cat, cardType) => {
          if (cardType === "flash") {
            docxCards.forEach(c => {
              const answer = c.sections.map(s => s.content).join("\n");
              addFlashCard(c.question, answer, cat);
            });
          } else {
            importCards(docxCards, cat);
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
          setEditingCard(card);
          setView("edit");
        }}
      />
    </div>
  );
}
