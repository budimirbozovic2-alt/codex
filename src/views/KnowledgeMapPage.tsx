import { useCardData, useCategoryData, useCardActions, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import KnowledgeMap from "@/components/KnowledgeMap";

export default function KnowledgeMapPage() {
  const { cards, categories, subcategories, reorderCategories, reorderSubcategories, ready } = useCardContext();
  const { categoryRecords } = useCategoryData();
  const { setView } = useUIContext();

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Učitavanje mape znanja...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Mapa znanja" onNavigateHome={() => setView("dashboard")}>
      <KnowledgeMap
        cards={cards}
        categories={categories}
        subcategories={subcategories}
        categoryRecords={categoryRecords}
        onReorderCategories={reorderCategories}
        onReorderSubcategories={reorderSubcategories}
      />
    </ErrorBoundary>
  );
}
