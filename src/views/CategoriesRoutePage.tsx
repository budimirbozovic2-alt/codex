import { FolderOpen } from "lucide-react";
import { useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import CategoriesPage from "@/views/CategoriesPage";

export default function CategoriesRoutePage() {
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Kategorije" onNavigateHome={() => setView("dashboard")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Kategorije</h1>
        </div>
        <CategoriesPage />
      </div>
    </ErrorBoundary>
  );
}
