import "@/index.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HashRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import { SessionProvider } from "@/contexts/SessionContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MainLayout from "@/components/MainLayout";
import TitleBar from "@/components/TitleBar";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import { lazy, Suspense } from "react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
const NotFound = lazy(() => import("./pages/NotFound"));

// Lazy-loaded route pages
const DashboardPage = lazy(() => import("@/views/DashboardPage"));
const ReviewPage = lazy(() => import("@/views/ReviewPage"));
const LearnPage = lazy(() => import("@/views/LearnPage"));
const CreatePage = lazy(() => import("@/views/CreatePage"));
const EditPage = lazy(() => import("@/views/EditPage"));
const SettingsPage = lazy(() => import("@/views/SettingsPage"));
const StatsPage = lazy(() => import("@/views/StatsPage"));
const MnemonicPage = lazy(() => import("@/views/MnemonicPage"));
const PlannerPage = lazy(() => import("@/views/PlannerPage"));

const SubjectDiagnosticsPage = lazy(() => import("@/views/SubjectDiagnosticsPage"));

const CategoriesRoutePage = lazy(() => import("@/views/CategoriesRoutePage"));

const MindMapPage = lazy(() => import("@/views/MindMapPage"));

const CategoryView = lazy(() => import("@/views/CategoryView"));
const SubjectDashboard = lazy(() => import("@/views/SubjectDashboard"));

const SubjectMindMapPage = lazy(() => import("@/views/SubjectMindMapPage"));
const SubjectMnemonicPage = lazy(() => import("@/views/SubjectMnemonicPage"));
const ZettelkastenView = lazy(() => import("@/views/ZettelkastenView"));
const SubjectCardsView = lazy(() => import("@/views/SubjectCardsView"));

/** key={categoryId} forces full remount when navigating between categories — resets all local state */
function CategoryViewWrapper() {
  const { categoryId } = useParams();
  return <ErrorBoundary label="Kategorija"><CategoryView key={categoryId} /></ErrorBoundary>;
}

function SubjectDashboardWrapper() {
  const { categoryId } = useParams();
  return <ErrorBoundary label="Predmet"><SubjectDashboard key={categoryId} /></ErrorBoundary>;
}

const App = () => (
    <TooltipProvider>
      <div className="flex flex-col h-screen" data-app-mounted>
        <TitleBar />
        <Sonner />
        <HashRouter>
          <AppProvider>
              <SessionProvider>
                <ErrorBoundary>
                  <MainLayout>
                    <Suspense fallback={<PageSkeleton />}>
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
                        <Route path="/create" element={<ErrorBoundary label="Kreiranje"><CreatePage /></ErrorBoundary>} />
                        <Route path="/edit" element={<ErrorBoundary label="Uređivanje"><EditPage /></ErrorBoundary>} />
                        <Route path="/settings" element={<ErrorBoundary label="Podešavanja"><SettingsPage /></ErrorBoundary>} />
                        <Route path="/stats" element={<ErrorBoundary label="Statistika"><StatsPage /></ErrorBoundary>} />
                        <Route path="/mnemonics" element={<ErrorBoundary label="Mnemonik"><MnemonicPage /></ErrorBoundary>} />
                        <Route path="/mnemonic" element={<Navigate to="/mnemonics" replace />} />
                        <Route path="/planner" element={<ErrorBoundary label="Planer"><PlannerPage /></ErrorBoundary>} />
                        <Route path="/metacognitive" element={<Navigate to="/" replace />} />
                        <Route path="/frequent-errors" element={<Navigate to="/" replace />} />
                        
                        <Route path="/categories" element={<ErrorBoundary label="Kategorije"><CategoriesRoutePage /></ErrorBoundary>} />
                        <Route path="/speed-reader" element={<Navigate to="/" replace />} />
                        <Route path="/mind-map" element={<ErrorBoundary label="Mapa uma"><MindMapPage /></ErrorBoundary>} />
                        
                        <Route path="*" element={<ErrorBoundary label="404"><NotFound /></ErrorBoundary>} />
                      </Routes>
                    </Suspense>
                  </MainLayout>
                  <ProcessingOverlay />
                </ErrorBoundary>
              </SessionProvider>
            
          </AppProvider>
        </HashRouter>
      </div>
    </TooltipProvider>
);

export default App;
