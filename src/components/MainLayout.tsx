import { ReactNode, useState, useEffect, lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { useAppContext } from "@/contexts/AppContext";
import ZenMode from "@/components/ZenMode";
import TopNav from "@/components/TopNav";
import { AnimatePresence } from "framer-motion";
import { hasSeenOnboarding } from "@/components/OnboardingModal";
import { APP_ONBOARDING_KEY } from "@/components/AppOnboarding";

const DocxImporter = lazy(() => import("@/components/DocxImporter"));
const GlobalSearch = lazy(() => import("@/components/GlobalSearch"));
const AppOnboarding = lazy(() => import("@/components/AppOnboarding"));

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

  return (
    <div className="min-h-screen flex flex-col w-full">
      <TopNav
        onOpenSearch={() => setGlobalSearchOpen(true)}
        onOpenDocxImport={() => setDocxOpen(true)}
        onToggleZen={() => setZenMode(v => !v)}
        zenActive={zenMode}
      />

      {/* Main content */}
      <main className="flex-1 px-4 md:px-8 py-6 max-w-6xl mx-auto w-full">
        {children}
      </main>

      <Suspense fallback={null}>
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
      </Suspense>
      <AnimatePresence>
        <ZenMode active={zenMode} onToggle={() => setZenMode(false)} />
      </AnimatePresence>
      <Suspense fallback={null}>
        <GlobalSearch
          cards={cards}
          open={globalSearchOpen}
          onClose={() => setGlobalSearchOpen(false)}
          onNavigateToCard={(card) => {
            setEditingCard(card);
            setView("edit");
          }}
        />
      </Suspense>
    </div>
  );
}
