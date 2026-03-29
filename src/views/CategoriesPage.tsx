import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CategoryManager from "@/components/CategoryManager";

export default function CategoriesPage() {
  const {
    categories, subcategories, cardCountByCategory,
    addCategory, renameCategory, deleteCategory,
  } = useCardContext();
  const { setView } = useUIContext();

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
