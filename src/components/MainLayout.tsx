import { ReactNode, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAppContext } from "@/contexts/AppContext";
import PomodoroTimer from "@/components/PomodoroTimer";
import DocxImporter from "@/components/DocxImporter";
import ZenMode from "@/components/ZenMode";
import GlobalSearch from "@/components/GlobalSearch";
import TopNav from "@/components/TopNav";
import { Search, Focus, FileText } from "lucide-react";
import { AnimatePresence } from "framer-motion";

export default function MainLayout({ children }: { children: ReactNode }) {
  const ctx = useAppContext();
  const { setView, setEditingCard, cards, categories, importCards, addFlashCard } = ctx;
  const { pathname } = useLocation();

  const [docxOpen, setDocxOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

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

  const isReviewOrLearn = pathname === "/review" || pathname === "/learn";

  return (
    <div className="min-h-screen flex flex-col w-full">
      <TopNav />

      {/* Utility strip — compact */}
      <div className="border-b h-9 px-4 flex items-center justify-end gap-1.5 bg-background/60 backdrop-blur-sm">
        <PomodoroTimer compact />
        <div className="w-px h-4 bg-border mx-0.5" />
        {isReviewOrLearn && (
          <button onClick={() => setZenMode(!zenMode)} className={`p-1 rounded-md hover:bg-secondary transition-colors ${zenMode ? "text-primary bg-primary/10" : "text-muted-foreground"}`} title="Zen Mode">
            <Focus className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={() => setGlobalSearchOpen(true)} className="p-1 rounded-md hover:bg-secondary text-muted-foreground" title="Pretraži (Ctrl+K)">
          <Search className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setDocxOpen(true)} className="p-1 rounded-md hover:bg-secondary text-muted-foreground" title="Uvezi DOCX">
          <FileText className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Main content */}
      <main className="flex-1 px-4 md:px-8 py-6 max-w-6xl mx-auto w-full">
        {children}
      </main>

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
