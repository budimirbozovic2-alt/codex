import "@/index.css";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
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
const MetacognitivePage = lazy(() => import("@/views/MetacognitivePage"));
const FrequentErrorsPage = lazy(() => import("@/views/FrequentErrorsPage"));
const CategoriesRoutePage = lazy(() => import("@/views/CategoriesRoutePage"));
const SpeedReaderPage = lazy(() => import("@/views/SpeedReaderPage"));
const MindMapPage = lazy(() => import("@/views/MindMapPage"));

// NOVE RUTE ZA CODEX 4.0
const SubjectDashboard = lazy(() => import("@/views/SubjectDashboard"));

const App = () => (
  <TooltipProvider>
    <div className="min-h-screen bg-background font-sans antialiased select-none">
      <HashRouter>
        <AppProvider>
          <SessionProvider>
            <ErrorBoundary label="App Root">
              <Sonner position="bottom-right" expand={false} richColors />
              <TitleBar />
              <MainLayout>
                <Suspense fallback={<PageSkeleton />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route
                      path="/dashboard"
                      element={
                        <ErrorBoundary label="Dashboard">
                          <DashboardPage />
                        </ErrorBoundary>
                      }
                    />

                    {/* NOVE KONTEKSTUALNE RUTE */}
                    <Route
                      path="/subject/:categoryId"
                      element={
                        <ErrorBoundary label="Subject Dashboard">
                          <SubjectDashboard />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/subject/:categoryId/speed-reader"
                      element={
                        <ErrorBoundary label="Speed Reader">
                          <SpeedReaderPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/subject/:categoryId/mind-maps"
                      element={
                        <ErrorBoundary label="Mape uma">
                          <MindMapPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/subject/:categoryId/mnemonics"
                      element={
                        <ErrorBoundary label="Mnemonik">
                          <MnemonicPage />
                        </ErrorBoundary>
                      }
                    />

                    <Route
                      path="/learn"
                      element={
                        <ErrorBoundary label="Učenje">
                          <LearnPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/review"
                      element={
                        <ErrorBoundary label="Ponavljanje">
                          <ReviewPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/create"
                      element={
                        <ErrorBoundary label="Kreiranje">
                          <CreatePage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/edit/:cardId"
                      element={
                        <ErrorBoundary label="Izmjena">
                          <EditPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <ErrorBoundary label="Podešavanja">
                          <SettingsPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/stats"
                      element={
                        <ErrorBoundary label="Statistika">
                          <StatsPage />
                        </ErrorBoundary>
                      }
                    />

                    <Route
                      path="/mnemonics"
                      element={
                        <ErrorBoundary label="Mnemonik">
                          <MnemonicPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route path="/mnemonic" element={<Navigate to="/mnemonics" replace />} />
                    <Route
                      path="/planner"
                      element={
                        <ErrorBoundary label="Planer">
                          <PlannerPage />
                        </ErrorBoundary>
                      }
                    />

                    <Route
                      path="/metacognitive"
                      element={
                        <ErrorBoundary label="Metakognicija">
                          <MetacognitivePage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/frequent-errors"
                      element={
                        <ErrorBoundary label="Česte greške\">
                          <FrequentErrorsPage />
                        </ErrorBoundary>
                      }
                    />

                    <Route
                      path="/categories"
                      element={
                        <ErrorBoundary label="Kategorije">
                          <CategoriesRoutePage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/speed-reader"
                      element={
                        <ErrorBoundary label="Speed Reader">
                          <SpeedReaderPage />
                        </ErrorBoundary>
                      }
                    />
                    <Route
                      path="/mind-map"
                      element={
                        <ErrorBoundary label="Mapa uma">
                          <MindMapPage />
                        </ErrorBoundary>
                      }
                    />

                    <Route
                      path="*"
                      element={
                        <ErrorBoundary label="404">
                          <NotFound />
                        </ErrorBoundary>
                      }
                    />
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
