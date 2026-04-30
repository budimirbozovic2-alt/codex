import { useCardData, useCategoryData, useCategoryActions, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CategoryManager from "@/components/CategoryManager";

export default function CategoriesPage() {
  const { cardCountByCategory, ready } = useCardData();
  const { categories, subcategories } = useCategoryData();
  const { addCategory, renameCategory, deleteCategory } = useCategoryActions();
  const { setView } = useUIContext();

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Učitavanje kategorija...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Kategorije" onNavigateHome={() => setView("dashboard")}>
      <CategoryManager
        categories={categories}
        subcategories={subcategories}
        cardCountByCategory={cardCountByCategory}
        onAdd={addCategory}
        onRename={renameCategory}
        onDelete={deleteCategory}
        onClose={() => setView("dashboard")}
      />
    </ErrorBoundary>
  );
}
