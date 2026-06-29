import { useCategoryActions } from "@/hooks/cards/useActions";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useUIContext } from "@/hooks/useUI";
import { useBootState } from "@/hooks/useBootState";
import { useCardCountsByCategoryMap } from "@/store";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CategoryManager from "@/components/CategoryManager";

export default function CategoriesPage() {
  const { categories, subcategories, categoryRecords } = useCategoryData();
  const { addCategory, renameCategory, deleteCategory } = useCategoryActions();
  const { setView } = useUIContext();
  const bootState = useBootState();
  const ready = bootState.type === "ready";
  // PR-F — counts come from SQL `SELECT COUNT(*)` per category, not from
  // a reducer over `useAllCards()`. Each id has its own cached query.
  const cardCountByCategory = useCardCountsByCategoryMap(categories);

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
        categoryRecords={categoryRecords}
        cardCountByCategory={cardCountByCategory}
        onAdd={addCategory}
        onRename={renameCategory}
        onDelete={deleteCategory}
        onClose={() => setView("dashboard")}
      />
    </ErrorBoundary>
  );
}
