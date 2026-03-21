import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CardForm from "@/components/CardForm";

export default function CreatePage() {
  const { categories, subcategories, addCard, addFlashCard, setView, setEditingCard } = useAppContext();

  return (
    <ErrorBoundary label="Nova kartica" onNavigateHome={() => setView("dashboard")}>
      <CardForm
        categories={categories}
        subcategories={subcategories}
        onSave={(q, s, c, sub, ch) => { addCard(q, s, c, sub, ch); setView("cards"); }}
        onSaveFlash={(q, a, c, sub) => { addFlashCard(q, a, c, sub); setView("cards"); }}
        onCancel={() => { setView("dashboard"); setEditingCard(null); }}
        editCard={null}
        onUpdate={() => {}}
      />
    </ErrorBoundary>
  );
}
