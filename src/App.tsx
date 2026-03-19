import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MainLayout from "@/components/MainLayout";
import { lazy, Suspense } from "react";
import NotFound from "./pages/NotFound";

// Lazy-loaded route pages
const DashboardPage = lazy(() => import("@/views/DashboardPage"));
const ReviewPage = lazy(() => import("@/views/ReviewPage"));
const LearnPage = lazy(() => import("@/views/LearnPage"));
const CreatePage = lazy(() => import("@/views/CreatePage"));
const EditPage = lazy(() => import("@/views/EditPage"));
const CardsView = lazy(() => import("@/views/CardsView"));
const CategoriesPage = lazy(() => import("@/views/CategoriesPage"));
const SettingsPage = lazy(() => import("@/views/SettingsPage"));
const StatsPage = lazy(() => import("@/views/StatsPage"));
const MnemonicPage = lazy(() => import("@/views/MnemonicPage"));
const PlannerPage = lazy(() => import("@/views/PlannerPage"));
const KnowledgeMapPage = lazy(() => import("@/views/KnowledgeMapPage"));
const MetacognitivePage = lazy(() => import("@/views/MetacognitivePage"));
const FrequentErrorsPage = lazy(() => import("@/views/FrequentErrorsPage"));
const MajorSystemPage = lazy(() => import("@/views/MajorSystemPage"));

const queryClient = new QueryClient();

const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="animate-pulse text-muted-foreground text-sm">Učitavanje...</div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AppProvider>
          <ErrorBoundary>
            <MainLayout>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/review" element={<ReviewPage />} />
                  <Route path="/learn" element={<LearnPage />} />
                  <Route path="/create" element={<CreatePage />} />
                  <Route path="/edit" element={<EditPage />} />
                  <Route path="/cards" element={<CardsView />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/stats" element={<StatsPage />} />
                  <Route path="/mnemonic" element={<MnemonicPage />} />
                  <Route path="/planner" element={<PlannerPage />} />
                  <Route path="/knowledge-map" element={<KnowledgeMapPage />} />
                  <Route path="/metacognitive" element={<MetacognitivePage />} />
                  <Route path="/frequent-errors" element={<FrequentErrorsPage />} />
                  <Route path="/major-system-settings" element={<MajorSystemPage />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </MainLayout>
          </ErrorBoundary>
        </AppProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
