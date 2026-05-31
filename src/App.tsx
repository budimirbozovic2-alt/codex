import "@/index.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HashRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { RouteTransition } from "@/components/RouteTransition";
import { AppProvider } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MainLayout from "@/components/MainLayout";
import TitleBar from "@/components/TitleBar";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import { lazy, Suspense, useEffect } from "react";
import { usePersistingState } from "@/hooks/usePersistingState";
import { RefreshCw } from "lucide-react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
// PR-D D5: pointer-events guard now installed in `main.tsx` before render.
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query/client";
const NotFound = lazy(() => import("./pages/NotFound"));

// Lazy-loaded route pages
const DashboardPage = lazy(() => import("@/views/DashboardPage"));
const ReviewPage = lazy(() => import("@/views/ReviewPage"));
const LearnPage = lazy(() => import("@/views/LearnPage"));
const EditPage = lazy(() => import("@/views/EditPage"));
const SettingsPage = lazy(() => import("@/views/SettingsPage"));
const PlannerPage = lazy(() => import("@/views/PlannerPage"));
const StatsPage = lazy(() => import("@/views/StatsPage"));

const SubjectDiagnosticsPage = lazy(() => import("@/views/SubjectDiagnosticsPage"));

const CategoriesRoutePage = lazy(() => import("@/views/CategoriesRoutePage"));

const CategoryView = lazy(() => import("@/views/CategoryView"));
const SubjectDashboard = lazy(() => import("@/views/SubjectDashboard"));

const SubjectMindMapPage = lazy(() => import("@/views/SubjectMindMapPage"));
const SubjectMnemonicPage = lazy(() => import("@/views/SubjectMnemonicPage"));
const ZettelkastenView = lazy(() => import("@/views/ZettelkastenView"));
const SubjectCardsView = lazy(() => import("@/views/SubjectCardsView"));

// PR-1 Editor V4 lab — dev-only, no production wiring.
const LabEditor = import.meta.env.DEV
  ? lazy(() => import("@/views/lab/LabEditor"))
  : null;

/** key={categoryId} forces full remount when navigating between categories — resets all local state */
function CategoryViewWrapper() {
  const { categoryId } = useParams();
  return <ErrorBoundary label="Kategorija"><CategoryView key={categoryId} /></ErrorBoundary>;
}

function SubjectDashboardWrapper() {
  const { categoryId } = useParams();
  return <ErrorBoundary label="Predmet"><SubjectDashboard key={categoryId} /></ErrorBoundary>;
}

const App = () => {
  const { hasPending: isSaving, pendingCount } = usePersistingState();

  // Install global guard for Radix Dialog `pointer-events: none` leak.
  useEffect(() => {
    const dispose = installBodyPointerEventsGuard();
    return dispose;
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSaving) {
        e.preventDefault();
        e.returnValue = "Podaci se još uvijek čuvaju. Da li ste sigurni da želite napustiti aplikaciju?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isSaving]);

  return (
    <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div className="flex flex-col h-screen relative" data-app-mounted>
        <TitleBar />
        {isSaving && (
          <div className="absolute bottom-4 right-4 z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground shadow-lg animate-fade-up">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            <span className="text-[11px] font-medium tracking-wide">
              {pendingCount > 10 ? `Spremanje (${pendingCount})...` : "Spremanje..."}
            </span>
          </div>
        )}
        <Sonner />
        <HashRouter>
          <AppProvider>
            <ErrorBoundary>
              <MainLayout>
                <Suspense fallback={<PageSkeleton />}>
                  <RouteTransition>
                  <Routes>
                    <Route path="/" element={<ErrorBoundary label="Početna"><DashboardPage /></ErrorBoundary>} />
                    <Route path="/category/:categoryId" element={<CategoryViewWrapper />} />
                    <Route path="/subject/:categoryId" element={<SubjectDashboardWrapper />} />

                    <Route path="/subject/:categoryId/mind-maps" element={<ErrorBoundary label="Mapa uma"><Suspense fallback={<PageSkeleton />}><SubjectMindMapPage /></Suspense></ErrorBoundary>} />
                    <Route path="/subject/:categoryId/mnemonics" element={<ErrorBoundary label="Mnemonik"><Suspense fallback={<PageSkeleton />}><SubjectMnemonicPage /></Suspense></ErrorBoundary>} />
                    <Route path="/subject/:categoryId/zettelkasten" element={<ErrorBoundary label="Zettelkasten"><Suspense fallback={<PageSkeleton />}><ZettelkastenView /></Suspense></ErrorBoundary>} />
                    <Route path="/subject/:categoryId/cards" element={<ErrorBoundary label="Kartice"><Suspense fallback={<PageSkeleton />}><SubjectCardsView /></Suspense></ErrorBoundary>} />
                    <Route path="/subject/:categoryId/diagnostics" element={<ErrorBoundary label="Dijagnostika"><Suspense fallback={<PageSkeleton />}><SubjectDiagnosticsPage /></Suspense></ErrorBoundary>} />
                    <Route path="/review" element={<ErrorBoundary label="Ponavljanje"><ReviewPage /></ErrorBoundary>} />
                    <Route path="/learn" element={<ErrorBoundary label="Učenje"><LearnPage /></ErrorBoundary>} />
                    <Route path="/edit" element={<ErrorBoundary label="Uređivanje"><EditPage /></ErrorBoundary>} />
                    <Route path="/settings" element={<ErrorBoundary label="Podešavanja"><SettingsPage /></ErrorBoundary>} />
                    <Route path="/planner" element={<PlannerPage />} />
                    <Route path="/planer" element={<Navigate to="/planner" replace />} />
                    <Route path="/stats" element={<StatsPage />} />
                    <Route path="/categories" element={<ErrorBoundary label="Kategorije"><CategoriesRoutePage /></ErrorBoundary>} />

                    {LabEditor && (
                      <Route
                        path="/__lab/editor"
                        element={
                          <ErrorBoundary label="Editor V4 Lab">
                            <Suspense fallback={<PageSkeleton />}>
                              <LabEditor />
                            </Suspense>
                          </ErrorBoundary>
                        }
                      />
                    )}
                    <Route path="*" element={<ErrorBoundary label="404"><NotFound /></ErrorBoundary>} />
                  </Routes>
                  </RouteTransition>
                </Suspense>
              </MainLayout>
              <ProcessingOverlay />
            </ErrorBoundary>
          </AppProvider>
        </HashRouter>
      </div>
    </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
