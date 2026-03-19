import { useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Database, FolderOpen, Download } from "lucide-react";
import { lazy, Suspense } from "react";
import { TabSkeleton } from "@/components/ui/page-skeleton";

const CardsView = lazy(() => import("@/views/CardsView"));
const CategoriesPage = lazy(() => import("@/views/CategoriesPage"));
const ExportImportDialog = lazy(() => import("@/components/ExportImportDialog"));

export default function DatabasePage() {
  const { cards, categories, exportData, exportTemplate, importData, setView } = useAppContext();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <ErrorBoundary label="Baza podataka" onNavigateHome={() => setView("dashboard")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">Baza podataka</h1>
          </div>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border hover:bg-secondary transition-colors text-muted-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Export / Import
          </button>
        </div>

        <Tabs defaultValue="cards" className="w-full">
          <TabsList className="w-full max-w-md">
            <TabsTrigger value="cards" className="flex-1 gap-1.5">
              <Database className="h-3.5 w-3.5" />
              Kartice
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex-1 gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />
              Kategorije
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cards" className="mt-4">
            <Suspense fallback={<TabSkeleton />}>
              <CardsView />
            </Suspense>
          </TabsContent>

          <TabsContent value="categories" className="mt-4">
            <Suspense fallback={<TabSkeleton />}>
              <CategoriesPage />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>

      <Suspense fallback={null}>
        {exportOpen && (
          <ExportImportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            onExportTemplate={exportTemplate}
            onExportFull={exportData}
            onImport={importData}
            cards={cards}
          />
        )}
      </Suspense>
    </ErrorBoundary>
  );
}
