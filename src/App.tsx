import "@/index.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import { SessionProvider } from "@/contexts/SessionContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MainLayout from "@/components/MainLayout";
import TitleBar from "@/components/TitleBar";
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

const CategoriesRoutePage = lazy(() => import("@/views/CategoriesRoutePage"));
const SpeedReaderPage = lazy(() => import("@/views/SpeedReaderPage"));
const MindMapPage = lazy(() => import("@/views/MindMapPage"));
const RomanForumPage = lazy(() => import("@/views/RomanForumPage"));
const CategoryView = lazy(() => import("@/views/CategoryView"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <div className="flex flex-col h-screen" data-app-mounted>
        <TitleBar />
        <Toaster />
        <Sonner />
        <HashRouter>
          <AppProvider>
            <ForumProvider>
              <ForumTransition />
              <SessionProvider>
                <ErrorBoundary>
                  <MainLayout>
                    <Suspense fallback={<PageSkeleton />}>
                      <Routes>
                        <Route path="/" element={<ErrorBoundary label="Početna"><DashboardPage /></ErrorBoundary>} />
                        <Route path="/category/:categoryId" element={<ErrorBoundary label="Kategorija"><CategoryView /></ErrorBoundary>} />
                        <Route path="/review" element={<ErrorBoundary label="Ponavljanje"><ReviewPage /></ErrorBoundary>} />
                        <Route path="/learn" element={<ErrorBoundary label="Učenje"><LearnPage /></ErrorBoundary>} />
                        <Route path="/create" element={<ErrorBoundary label="Kreiranje"><CreatePage /></ErrorBoundary>} />
                        <Route path="/edit" element={<ErrorBoundary label="Uređivanje"><EditPage /></ErrorBoundary>} />
                        <Route path="/settings" element={<ErrorBoundary label="Podešavanja"><SettingsPage /></ErrorBoundary>} />
                        <Route path="/stats" element={<ErrorBoundary label="Statistika"><StatsPage /></ErrorBoundary>} />
                        <Route path="/mnemonics" element={<ErrorBoundary label="Mnemonik"><MnemonicPage /></ErrorBoundary>} />
                        <Route path="/mnemonic" element={<Navigate to="/mnemonics" replace />} />
                        <Route path="/planner" element={<ErrorBoundary label="Planer"><PlannerPage /></ErrorBoundary>} />
                        <Route path="/knowledge-map" element={<ErrorBoundary label="Mapa znanja"><KnowledgeMapPage /></ErrorBoundary>} />
                        <Route path="/metacognitive" element={<ErrorBoundary label="Metakognicija"><MetacognitivePage /></ErrorBoundary>} />
                        <Route path="/frequent-errors" element={<ErrorBoundary label="Česte greške"><FrequentErrorsPage /></ErrorBoundary>} />
                        
                        <Route path="/categories" element={<ErrorBoundary label="Kategorije"><CategoriesRoutePage /></ErrorBoundary>} />
                        <Route path="/speed-reader" element={<ErrorBoundary label="Speed Reader"><SpeedReaderPage /></ErrorBoundary>} />
                        <Route path="/mind-map" element={<ErrorBoundary label="Mapa uma"><MindMapPage /></ErrorBoundary>} />
                        <Route path="/forum" element={<ErrorBoundary label="Forum"><RomanForumPage /></ErrorBoundary>} />
                        <Route path="*" element={<ErrorBoundary label="404"><NotFound /></ErrorBoundary>} />
                      </Routes>
                    </Suspense>
                  </MainLayout>
                  <ProcessingOverlay />
                </ErrorBoundary>
              </SessionProvider>
            </ForumProvider>
          </AppProvider>
        </HashRouter>
      </div>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
