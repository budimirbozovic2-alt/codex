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

const queryClient = new QueryClient();

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
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/review" element={<ReviewPage />} />
                      <Route path="/learn" element={<LearnPage />} />
                      <Route path="/create" element={<CreatePage />} />
                      <Route path="/edit" element={<EditPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/stats" element={<StatsPage />} />
                      <Route path="/mnemonic" element={<MnemonicPage />} />
                      <Route path="/planner" element={<PlannerPage />} />
                      <Route path="/knowledge-map" element={<KnowledgeMapPage />} />
                      <Route path="/metacognitive" element={<MetacognitivePage />} />
                      <Route path="/frequent-errors" element={<FrequentErrorsPage />} />
                      <Route path="/major-system-settings" element={<MajorSystemPage />} />
                      <Route path="/database" element={<DatabasePage />} />
                      <Route path="/speed-reader" element={<SpeedReaderPage />} />
                      <Route path="/mind-map" element={<MindMapPage />} />
                      {/* Legacy redirects */}
                      <Route path="/cards" element={<DatabasePage />} />
                      <Route path="/categories" element={<DatabasePage />} />
                      <Route path="*" element={<NotFound />} />
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
