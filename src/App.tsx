import "@/index.css";
import "@/App.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import { SessionProvider } from "@/contexts/SessionContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MainLayout from "@/components/MainLayout";
import ProcessingOverlay from "@/components/ProcessingOverlay";
import { lazy, Suspense } from "react";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import NotFound from "./pages/NotFound";

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
const KnowledgeMapPage = lazy(() => import("@/views/KnowledgeMapPage"));
const MetacognitivePage = lazy(() => import("@/views/MetacognitivePage"));
const FrequentErrorsPage = lazy(() => import("@/views/FrequentErrorsPage"));
const MajorSystemPage = lazy(() => import("@/views/MajorSystemPage"));
const DatabasePage = lazy(() => import("@/views/DatabasePage"));
const SpeedReaderPage = lazy(() => import("@/views/SpeedReaderPage"));
const MindMapPage = lazy(() => import("@/views/MindMapPage"));

const queryClient = new QueryClient(); // rebuild trigger v2

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div>
        <Toaster />
        <Sonner />
        <HashRouter>
          <AppProvider>
            <SessionProvider>
              <ErrorBoundary>
                <MainLayout>
                  <Suspense fallback={<PageSkeleton />}>
                    <Routes>
                      <Route path="/" element={<ErrorBoundary label="Početna"><DashboardPage /></ErrorBoundary>} />
                      <Route path="/review" element={<ErrorBoundary label="Ponavljanje"><ReviewPage /></ErrorBoundary>} />
                      <Route path="/learn" element={<ErrorBoundary label="Učenje"><LearnPage /></ErrorBoundary>} />
                      <Route path="/create" element={<ErrorBoundary label="Kreiranje"><CreatePage /></ErrorBoundary>} />
                      <Route path="/edit" element={<ErrorBoundary label="Uređivanje"><EditPage /></ErrorBoundary>} />
                      <Route path="/settings" element={<ErrorBoundary label="Podešavanja"><SettingsPage /></ErrorBoundary>} />
                      <Route path="/stats" element={<ErrorBoundary label="Statistika"><StatsPage /></ErrorBoundary>} />
                      <Route path="/mnemonic" element={<ErrorBoundary label="Mnemonik"><MnemonicPage /></ErrorBoundary>} />
                      <Route path="/planner" element={<ErrorBoundary label="Planer"><PlannerPage /></ErrorBoundary>} />
                      <Route path="/knowledge-map" element={<ErrorBoundary label="Mapa znanja"><KnowledgeMapPage /></ErrorBoundary>} />
                      <Route path="/metacognitive" element={<ErrorBoundary label="Metakognicija"><MetacognitivePage /></ErrorBoundary>} />
                      <Route path="/frequent-errors" element={<ErrorBoundary label="Česte greške"><FrequentErrorsPage /></ErrorBoundary>} />
                      <Route path="/major-system-settings" element={<ErrorBoundary label="Major sistem"><MajorSystemPage /></ErrorBoundary>} />
                      <Route path="/database" element={<ErrorBoundary label="Baza podataka"><DatabasePage /></ErrorBoundary>} />
                      <Route path="/speed-reader" element={<ErrorBoundary label="Speed Reader"><SpeedReaderPage /></ErrorBoundary>} />
                      <Route path="/mind-map" element={<ErrorBoundary label="Mapa uma"><MindMapPage /></ErrorBoundary>} />
                      {/* Legacy redirects */}
                      <Route path="/cards" element={<ErrorBoundary label="Baza podataka"><DatabasePage /></ErrorBoundary>} />
                      <Route path="/categories" element={<ErrorBoundary label="Baza podataka"><DatabasePage /></ErrorBoundary>} />
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
  </QueryClientProvider>
);

export default App;
