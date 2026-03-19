import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";

export default function EditPage() {
  const { categories, subcategories, updateCard, setView, editingCard, setEditingCard } = useAppContext();

  return (
    <ErrorBoundary label="Uredi karticu" onNavigateHome={() => setView("dashboard")}>
      <CardForm
        categories={categories}
        subcategories={subcategories}
        onSave={() => {}}
        onSaveFlash={() => {}}
        onCancel={() => { setView("dashboard"); setEditingCard(null); }}
        editCard={editingCard}
        onUpdate={(id, u) => { updateCard(id, u); setView("cards"); setEditingCard(null); }}
      />
    </ErrorBoundary>
  );
}
