import { useState, lazy, Suspense } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { default as Database } from "lucide-react/dist/esm/icons/database";
import { default as FolderOpen } from "lucide-react/dist/esm/icons/folder-open";
import { default as Download } from "lucide-react/dist/esm/icons/download";
import { default as FileText } from "lucide-react/dist/esm/icons/file-text";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import InfoPanel from "@/components/InfoPanel";

const CardsView = lazy(() => import("@/views/CardsView"));
const CategoriesPage = lazy(() => import("@/views/CategoriesPage"));
const SourcesView = lazy(() => import("@/views/SourcesView"));
const ExportImportDialog = lazy(() => import("@/components/ExportImportDialog"));
const DocxImporter = lazy(() => import("@/components/DocxImporter"));

export default function DatabasePage() {
  const { cards, categories, subcategories, exportData, exportTemplate, importData, importCards, addFlashCard, setView } = useAppContext();
  const [exportOpen, setExportOpen] = useState(false);
  const [docxOpen, setDocxOpen] = useState(false);

  return (
    <ErrorBoundary label="Baza podataka" onNavigateHome={() => setView("dashboard")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold">Baza podataka</h1>
          </div>
          <div className="flex items-center gap-2">
            <InfoPanel title="Kako radi Baza podataka?">
              <p><strong className="text-foreground">Kartice</strong> — pregled, pretraga i filtriranje svih kartica. Podržava bulk operacije (označi više → dodijeli podkategoriju ili glavu) i manuelni drag-and-drop redoslijed.</p>
              <p><strong className="text-foreground">Kategorije</strong> — hijerarhijsko upravljanje kategorijama i podkategorijama. Svaka kategorija prikazuje broj kartica.</p>
              <p><strong className="text-foreground">Context menu (⋯)</strong> — brze akcije na svakoj kartici: premjesti kategoriju, dodijeli glavu, označi tagove ili kloniraj u Mnemo radionicu.</p>
              <p><strong className="text-foreground">Export/Import</strong> — izvezi sve podatke kao JSON/ZIP backup ili uvezi podatke iz drugog uređaja. Podržava kompresiju i rezoluciju konflikata.</p>
              <p><strong className="text-foreground">Tagovi:</strong></p>
              <ul className="space-y-1 pl-3">
                <li>🔥 „Često na ispitu" — prioritetne kartice</li>
                <li>🧠 „Mnemonic" — kartica je klonirana u Mnemo radionicu</li>
              </ul>
            </InfoPanel>
            <button
              onClick={() => setDocxOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border hover:bg-secondary transition-colors text-muted-foreground"
            >
              <FileText className="h-3.5 w-3.5" />
              DOCX Import
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border hover:bg-secondary transition-colors text-muted-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Export / Import
            </button>
          </div>
        </div>

        <Tabs defaultValue="cards" className="w-full">
          <TabsList className="w-full max-w-lg">
            <TabsTrigger value="cards" className="flex-1 gap-1.5">
              <Database className="h-3.5 w-3.5" />
              Kartice
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex-1 gap-1.5">
              <FolderOpen className="h-3.5 w-3.5" />
              Kategorije
            </TabsTrigger>
            <TabsTrigger value="sources" className="flex-1 gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Izvori
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

          <TabsContent value="sources" className="mt-4">
            <Suspense fallback={<TabSkeleton />}>
              <SourcesView />
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
    </ErrorBoundary>
  );
}
