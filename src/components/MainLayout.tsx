import { ReactNode, useState, useEffect, useRef, lazy, Suspense, useMemo, memo } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useLocation } from "react-router-dom";
import { useUIContext, useCardContext } from "@/contexts/AppContext";
import ZenMode from "@/components/ZenMode";
import TopNav from "@/components/TopNav";
import { AnimatePresence } from "framer-motion";
import { hasSeenOnboarding } from "@/components/OnboardingModal";
import { APP_ONBOARDING_KEY } from "@/components/AppOnboarding";
import { toast } from "@/hooks/use-toast";
import { type PlannerConfig, loadPlanner, getSmartSuggestion, calcVelocity, getDailyMappedCount } from "@/lib/planner-storage";

const DocxImporter = lazy(() => import("@/components/DocxImporter"));
const GlobalSearch = lazy(() => import("@/components/GlobalSearch"));
const AppOnboarding = lazy(() => import("@/components/AppOnboarding"));

// Routes where the user is actively working on source material
const SOURCE_ROUTES = ["/cards", "/categories", "/sources", "/database"];

/** Isolated component for planner nudge — prevents MainLayout re-render on card changes */
const NudgeWatcher = memo(function NudgeWatcher() {
  const { cards } = useCardContext();
  const { pathname } = useLocation();
  const prevPathRef = useRef(pathname);
  const nudgeShownRef = useRef(false);
  const plannerRef = useRef<PlannerConfig | null>(null);

  const getPlannerCached = () => {
    if (!plannerRef.current) plannerRef.current = loadPlanner();
    return plannerRef.current;
  };

  useEffect(() => {
    if (pathname === "/planner") plannerRef.current = null;
  }, [pathname]);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = pathname;
    if (!SOURCE_ROUTES.some(r => prevPath.startsWith(r))) return;
    if (SOURCE_ROUTES.some(r => pathname.startsWith(r))) return;
    if (nudgeShownRef.current) return;

    try {
      const planner = getPlannerCached();
      if (!planner.finalGoalDate || planner.phases.length === 0) return;
      const velocity = calcVelocity([], 7);
      const suggestion = getSmartSuggestion(null, cards, planner.finalGoalDate, velocity, planner.bufferPercent ?? 15);
      if (!suggestion || suggestion.suggestedToday <= 0) return;
      const dailyDone = getDailyMappedCount();
      const remaining = suggestion.suggestedToday - dailyDone;
      if (remaining > 0 && dailyDone < suggestion.suggestedToday) {
        nudgeShownRef.current = true;
        toast({
          title: "📌 Ostani fokusiran",
          description: `Preostalo ti je još ${remaining} od ${suggestion.suggestedToday} planiranih sekcija za danas.`,
          duration: 5000,
        });
        setTimeout(() => { nudgeShownRef.current = false; }, 30 * 60 * 1000);
      }
    } catch {}
  }, [pathname, cards]);

  return null;
});

/** Isolated wrapper for GlobalSearch — accesses cards via own context */
const GlobalSearchWrapper = memo(function GlobalSearchWrapper({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { cards } = useCardContext();
  const { setView, setEditingCard } = useUIContext();
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <GlobalSearch
        cards={cards}
        open={open}
        onClose={onClose}
        onNavigateToCard={(card) => {
          setEditingCard(card);
          setView("edit");
        }}
      />
    </Suspense>
  );
});

/** Isolated wrapper for DocxImporter — accesses cards via own context */
const DocxImporterWrapper = memo(function DocxImporterWrapper({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { categories, importCards, addFlashCard } = useCardContext();
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <DocxImporter
        open={open}
        onClose={onClose}
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
          onClose();
        }}
      />
    </Suspense>
  );
});

export default function MainLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  const [docxOpen, setDocxOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [showAppOnboarding, setShowAppOnboarding] = useState(
    () => !hasSeenOnboarding(APP_ONBOARDING_KEY)
  );

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
    <div className="flex-1 flex flex-col w-full overflow-auto">
      <TopNav
        onOpenSearch={() => setGlobalSearchOpen(true)}
        onOpenDocxImport={() => setDocxOpen(true)}
        onToggleZen={() => setZenMode(v => !v)}
        zenActive={zenMode}
        onOpenOnboarding={() => setShowAppOnboarding(true)}
      />

      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Nudge watcher — isolated to avoid re-renders */}
      <NudgeWatcher />

      {/* Main content — full width for source routes, centered otherwise */}
      <main className={`flex-1 px-4 md:px-8 py-6 w-full ${
        SOURCE_ROUTES.some(r => pathname.startsWith(r)) ? "max-w-none" : "max-w-6xl mx-auto"
      }`}>
        {children}
      </main>

      <DocxImporterWrapper open={docxOpen} onClose={() => setDocxOpen(false)} />
      <AnimatePresence>
        <ZenMode active={zenMode} onToggle={() => setZenMode(false)} />
      </AnimatePresence>
      <GlobalSearchWrapper open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      <AnimatePresence>
        {showAppOnboarding && (
          <Suspense fallback={null}>
            <AppOnboarding onComplete={() => setShowAppOnboarding(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
