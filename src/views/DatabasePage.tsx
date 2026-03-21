import { useState, useMemo, lazy, Suspense } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { default as Database } from "lucide-react/dist/esm/icons/database";
import { default as FolderOpen } from "lucide-react/dist/esm/icons/folder-open";
import { default as Download } from "lucide-react/dist/esm/icons/download";
import { default as FileText } from "lucide-react/dist/esm/icons/file-text";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import InfoPanel from "@/components/InfoPanel";

const CardsView = lazy(() => import("@/views/CardsView"));
const CategoriesPage = lazy(() => import("@/views/CategoriesPage"));
const ExportImportDialog = lazy(() => import("@/components/ExportImportDialog"));
const DocxImporter = lazy(() => import("@/components/DocxImporter"));
const MentalSkeleton = lazy(() => import("@/components/MentalSkeleton"));

export default function DatabasePage() {
  const { cards, categories, subcategories, exportData, exportTemplate, importData, importCards, addFlashCard, setView, bulkUpdateChapter, reviewSection } = useAppContext();
  const [exportOpen, setExportOpen] = useState(false);
  const [docxOpen, setDocxOpen] = useState(false);
  const [skeletonTarget, setSkeletonTarget] = useState<{ category: string; subcategory: string } | null>(null);

  // If Mental Skeleton is active, show it
  if (skeletonTarget) {
    return (
      <ErrorBoundary label="Mentalni Kostur" onNavigateHome={() => setSkeletonTarget(null)}>
        <Suspense fallback={<TabSkeleton />}>
          <MentalSkeleton
            cards={cards}
            category={skeletonTarget.category}
            subcategory={skeletonTarget.subcategory}
            onBack={() => setSkeletonTarget(null)}
            onUpdateChapters={bulkUpdateChapter}
            onReviewSection={reviewSection}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

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
              <p><strong className="text-foreground">Kartice</strong> — pregled, pretraga i filtriranje svih kartica. Podržava bulk operacije (označi više → dodijeli podkategoriju).</p>
              <p><strong className="text-foreground">Kategorije</strong> — hijerarhijsko upravljanje kategorijama i podkategorijama. Svaka kategorija prikazuje broj kartica.</p>
              <p><strong className="text-foreground">Mentalni Kostur</strong> — vizualna mapa za organizaciju eseja po glavama. Podržava drag-and-drop i dva moda (Navigator / Auditor).</p>
              <p><strong className="text-foreground">Export/Import</strong> — izvezi sve podatke kao JSON backup ili uvezi podatke iz drugog uređaja.</p>
              <p><strong className="text-foreground">Tagovi:</strong></p>
              <ul className="space-y-1 pl-3">
                <li>🔥 „Često na ispitu" — prioritetne kartice</li>
                <li>🧠 „Memorizacija" — šalje karticu u Mnemo radionicu</li>
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
            <TabsTrigger value="skeleton" className="flex-1 gap-1.5">
              <Brain className="h-3.5 w-3.5" />
              Mentalni Kostur
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

          <TabsContent value="skeleton" className="mt-4">
            <SkeletonLauncher
              categories={categories}
              subcategories={subcategories}
              cards={cards}
              onLaunch={(cat, sub) => setSkeletonTarget({ category: cat, subcategory: sub })}
            />
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

// ── Skeleton Launcher: pick category → subcategory ──────
function SkeletonLauncher({
  categories, subcategories, cards, onLaunch,
}: {
  categories: string[];
  subcategories: Record<string, string[]>;
  cards: { category: string; subcategory?: string }[];
  onLaunch: (cat: string, sub: string) => void;
}) {
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach(c => { counts[c.category] = (counts[c.category] || 0) + 1; });
    return counts;
  }, [cards]);

  const subCounts = useMemo(() => {
    if (!selectedCat) return {};
    const counts: Record<string, number> = {};
    cards.filter(c => c.category === selectedCat).forEach(c => {
      const sub = c.subcategory || "";
      if (sub) counts[sub] = (counts[sub] || 0) + 1;
    });
    return counts;
  }, [cards, selectedCat]);

  const subs = selectedCat ? (subcategories[selectedCat] || []) : [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Odaberi podkategoriju (zakon) da otvoriš Mentalni Kostur sa strukturom po glavama.
      </p>

      {/* Category selection */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">1. Kategorija (Predmet)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categories.filter(cat => (catCounts[cat] || 0) > 0).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat === selectedCat ? null : cat)}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedCat === cat
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "hover:bg-secondary"
              }`}
            >
              <span className="text-sm font-medium">{cat}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">{catCounts[cat] || 0} kartica</span>
            </button>
          ))}
        </div>
      </div>

      {/* Subcategory selection */}
      {selectedCat && subs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">2. Podkategorija (Zakon)</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {subs.filter(sub => (subCounts[sub] || 0) > 0).map(sub => (
              <button
                key={sub}
                onClick={() => onLaunch(selectedCat, sub)}
                className="p-3 rounded-xl border text-left hover:bg-secondary hover:border-primary/30 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium group-hover:text-primary transition-colors">{sub}</span>
                  <Brain className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <span className="block text-xs text-muted-foreground mt-0.5">{subCounts[sub] || 0} kartica</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedCat && subs.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Ova kategorija nema podkategorije. Kreiraj podkategorije u tabu "Kategorije".
        </p>
      )}
    </div>
  );
}
