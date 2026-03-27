import { Landmark } from "lucide-react";
import { lazy, Suspense } from "react";
import { useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TabSkeleton } from "@/components/ui/page-skeleton";

const SourceManager = lazy(() => import("@/components/SourceManager"));

export default function SourceRegistryPage() {
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Registar izvora" onNavigateHome={() => setView("dashboard")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Registar izvora</h1>
        </div>
        <Suspense fallback={<TabSkeleton />}>
          <SourceManager />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
