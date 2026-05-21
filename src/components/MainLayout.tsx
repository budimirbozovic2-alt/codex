import { ReactNode, useState, useEffect, useRef, lazy, Suspense, memo, useCallback } from "react";
import Breadcrumbs from "@/components/Breadcrumbs";
import { useLocation } from "react-router-dom";
import { useUIContext, useCardData, useCategoryData, useCardOnlyActions, useBackupActions, useReviewData } from "@/contexts/AppContext";
import ZenMode from "@/components/ZenMode";
import AppSidebar from "@/components/AppSidebar";
import BlockingModal from "@/components/db/BlockingModal";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { hasSeenOnboarding } from "@/components/OnboardingModal";
import { ONBOARDING_KEYS } from "@/components/onboarding/presets";
import { toast } from "sonner";
import { Moon, Sun, Search, Focus, HelpCircle } from "lucide-react";
import { setDarkMode } from "@/lib/app-settings";
import { useEditReturn } from "@/hooks/useEditReturn";
import { useGlobalHotkey } from "@/hooks/useGlobalHotkey";

const DocxImporter = lazy(() => import("@/features/docx-importer").then(m => ({ default: m.DocxImporter })));
const GlobalSearch = lazy(() => import("@/components/GlobalSearch"));
const OnboardingModal = lazy(() => import("@/components/OnboardingModal"));

const SOURCE_ROUTES = ["/categories", "/category/"];

/** Isolated component for planner nudge — lazy-loads planner-storage */
/** M2 fix: NudgeWatcher reads cards/reviewLog lazily via refs to avoid
 *  re-rendering on every card mutation. Only checks on route change. */
const NudgeWatcher = memo(function NudgeWatcher() {
  const { pathname } = useLocation();
  const prevPathRef = useRef(pathname);
  const nudgeShownRef = useRef(false);
  const plannerModRef = useRef<typeof import("@/lib/planner-storage") | null>(null);

  const { cards } = useCardData();
  const { reviewLog } = useReviewData();

  useEffect(() => {
    if (pathname === "/planner") plannerModRef.current = null;
  }, [pathname]);

  useEffect(() => {
    const prevPath = prevPathRef.current;
    prevPathRef.current = pathname;
    if (!SOURCE_ROUTES.some(r => prevPath.startsWith(r))) return;
    if (SOURCE_ROUTES.some(r => pathname.startsWith(r))) return;
    if (nudgeShownRef.current) return;

    (async () => {
      try {
        if (!plannerModRef.current) {
          plannerModRef.current = await import("@/lib/planner-storage");
        }
        const { loadPlanner, getSmartSuggestion, calcVelocity, getDailyMappedCount } = plannerModRef.current;
        const planner = loadPlanner();
        if (!planner.finalGoalDate || planner.phases.length === 0) return;
        const velocity = calcVelocity(reviewLog, 7);
        const suggestion = getSmartSuggestion(null, cards, planner.finalGoalDate, velocity, planner.bufferPercent ?? 15);
        if (!suggestion || suggestion.suggestedToday <= 0) return;
        const dailyDone = getDailyMappedCount();
        const remaining = suggestion.suggestedToday - dailyDone;
        if (remaining > 0 && dailyDone < suggestion.suggestedToday) {
          nudgeShownRef.current = true;
          toast("📌 Ostani fokusiran", {
            description: `Preostalo ti je još ${remaining} od ${suggestion.suggestedToday} planiranih sekcija za danas.`,
            duration: 5000,
          });
          setTimeout(() => { nudgeShownRef.current = false; }, 30 * 60 * 1000);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
});

/** Isolated wrapper for GlobalSearch.
 *
 * Phase-3 perf fix: this wrapper renders on every MainLayout pass, so it must
 * NOT subscribe to global card data. Previously `useCardData()` was called
 * here, which made every card mutation re-render the wrapper (and its tree)
 * even while the search modal was closed. The `cards` subscription now lives
 * INSIDE `GlobalSearch`, which only mounts when `open === true` (see the
 * early-return guard below + the `lazy()` import). */
const GlobalSearchWrapper = memo(function GlobalSearchWrapper({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { setView, setEditingCardId } = useUIContext();
  // M3: editingCardId is sourced from UIContext SSOT — no local ref needed.
  // Path is resolved lazily inside `stash()` so it reflects the route at
  // the moment of the click, not when this wrapper mounted.
  const { stash: stashEditReturn } = useEditReturn({
    path: () => window.location.pathname + window.location.search,
  });
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <GlobalSearch
        open={open}
        onClose={onClose}
        onNavigateToCard={(card) => {
          setEditingCardId(card.id);
          stashEditReturn(card.id);
          setView("edit");
        }}
      />
    </Suspense>
  );
});

/** Isolated wrapper for DocxImporter */
const DocxImporterWrapper = memo(function DocxImporterWrapper({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const { categories } = useCategoryData();
  const { addFlashCard } = useCardOnlyActions();
  const { importCards } = useBackupActions();
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
    () => !hasSeenOnboarding(ONBOARDING_KEYS.app)
  );
  const [dark, setDarkState] = useState(() => document.documentElement.classList.contains("dark"));

  const toggleDark = useCallback(() => {
    const next = !dark;
    setDarkState(next);
    setDarkMode(next);
  }, [dark]);

  useGlobalHotkey(
    e => (e.ctrlKey || e.metaKey) && e.key === "k",
    e => { e.preventDefault(); setGlobalSearchOpen(v => !v); },
  );

  const isFullWidth = SOURCE_ROUTES.some(r => pathname.startsWith(r));

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-0 flex-1 w-full">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Compact header bar */}
          <a href="#main-content" className="skip-to-content">Preskoči na sadržaj</a>
          <header className="sticky top-0 z-40 flex items-center h-11 px-4 border-b bg-background/90 backdrop-blur-md gap-2">
            <SidebarTrigger className="shrink-0" />
            <Breadcrumbs />
            <div className="flex-1" />
            <button
              onClick={() => setGlobalSearchOpen(true)}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              aria-label="Pretraži (Ctrl+K)"
              title="Pretraži (Ctrl+K)"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowAppOnboarding(true)}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              aria-label="Vodič"
              title="Vodič"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <button
              onClick={() => setZenMode(v => !v)}
              className={`p-1.5 rounded-md hover:bg-secondary transition-colors ${zenMode ? "text-primary bg-primary/10" : "text-muted-foreground"}`}
              aria-label="Zen Mode"
              aria-pressed={zenMode}
              title="Zen Mode"
            >
              <Focus className="h-4 w-4" />
            </button>
            <button
              onClick={toggleDark}
              className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
              aria-label={dark ? "Prebaci na svijetlu temu" : "Prebaci na tamnu temu"}
              title="Tema"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </header>

          <NudgeWatcher />

          <main id="main-content" className={`flex-1 px-4 md:px-8 py-6 w-full ${
            isFullWidth ? "max-w-none" : "max-w-6xl mx-auto"
          }`}>
            {children}
          </main>
        </div>
      </div>

      <DocxImporterWrapper open={docxOpen} onClose={() => setDocxOpen(false)} />
      <ZenMode active={zenMode} onToggle={() => setZenMode(false)} />
      <GlobalSearchWrapper open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      {showAppOnboarding && (
        <Suspense fallback={null}>
          <OnboardingModal preset="app" onComplete={() => setShowAppOnboarding(false)} />
        </Suspense>
      )}
      <BlockingModal />
    </SidebarProvider>
  );
}
