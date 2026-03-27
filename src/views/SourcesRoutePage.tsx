import { BookOpen } from "lucide-react";
import { lazy, Suspense } from "react";
import { useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { TabSkeleton } from "@/components/ui/page-skeleton";

const SourcesView = lazy(() => import("@/views/SourcesView"));

export default function SourcesRoutePage() {
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Izvori" onNavigateHome={() => setView("dashboard")}>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold">Izvori</h1>
        </div>
        <Suspense fallback={<TabSkeleton />}>
          <SourcesView />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
}
