import { ReactNode, useState, useEffect, useRef, lazy, Suspense } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useLocation } from "react-router-dom";
import { useAppContext } from "@/contexts/AppContext";
import ZenMode from "@/components/ZenMode";
import TopNav from "@/components/TopNav";
import { AnimatePresence } from "framer-motion";
import { hasSeenOnboarding } from "@/components/OnboardingModal";
import { APP_ONBOARDING_KEY } from "@/components/AppOnboarding";
import { toast } from "@/hooks/use-toast";
import { loadPlanner, getSmartSuggestion, calcVelocity, getDailyMappedCount } from "@/lib/planner-storage";

const DocxImporter = lazy(() => import("@/components/DocxImporter"));
const GlobalSearch = lazy(() => import("@/components/GlobalSearch"));
const AppOnboarding = lazy(() => import("@/components/AppOnboarding"));

// Routes where the user is actively working on source material
const SOURCE_ROUTES = ["/database"];

export default function MainLayout({ children }: { children: ReactNode }) {
  const ctx = useAppContext();
  const { setView, setEditingCard, cards, categories, importCards, addFlashCard } = ctx;
  const { pathname } = useLocation();

  const [docxOpen, setDocxOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [showAppOnboarding, setShowAppOnboarding] = useState(
    () => !hasSeenOnboarding(APP_ONBOARDING_KEY)
  );

  // Track previous route for gentle nudge
  const prevPathRef = useRef(pathname);
  const nudgeShownRef = useRef(false);

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

  // Gentle nudge: show toast when leaving source/database route with unmet daily quota
  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = pathname;

    // Only trigger when navigating AWAY from source routes
    if (!SOURCE_ROUTES.some(r => prevPath.startsWith(r))) return;
    if (SOURCE_ROUTES.some(r => pathname.startsWith(r))) return;
    if (nudgeShownRef.current) return;

    try {
      const planner = loadPlanner();
      if (!planner.finalGoalDate || planner.phases.length === 0) return;

      const velocity = calcVelocity([], 7); // lightweight check
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
        // Reset nudge flag after 30 min so it can show again
        setTimeout(() => { nudgeShownRef.current = false; }, 30 * 60 * 1000);
      }
    } catch {}
  }, [pathname, cards]);

  return (
    <div className="min-h-screen flex flex-col w-full">
      <TopNav
        onOpenSearch={() => setGlobalSearchOpen(true)}
        onOpenDocxImport={() => setDocxOpen(true)}
        onToggleZen={() => setZenMode(v => !v)}
        zenActive={zenMode}
        onOpenOnboarding={() => setShowAppOnboarding(true)}
      />

      {/* Breadcrumbs */}
      <Breadcrumbs />

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
