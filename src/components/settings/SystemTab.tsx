import { Database, FolderOpen } from "lucide-react";
import { lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import CategoryManager from "@/components/CategoryManager";
import { TabSkeleton } from "@/components/ui/page-skeleton";
import type { CategoryRecord } from "@/lib/category-service";

const HealthMonitor = lazy(() => import("@/components/HealthMonitor"));

interface Props {
  categories: string[];
  subcategories: Record<string, string[]>;
  categoryRecords: CategoryRecord[];
  cardCountByCategory: Record<string, number>;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
  onOpenExportImport: () => void;
}

export default function SystemTab({ categories, subcategories, cardCountByCategory, onAdd, onRename, onDelete, onOpenExportImport }: Props) {
  return (
    <div className="space-y-5">
      {/* Backup & Restore */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold">Backup & Restore</h3>
        <p className="text-xs text-muted-foreground">Izvezi ili uvezi kompletnu bazu podataka.</p>
        <Button variant="outline" className="gap-2" onClick={onOpenExportImport}>
          <Database className="h-4 w-4" />
          Export / Import
        </Button>
      </div>

      {/* Predmeti (CategoryManager) */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Predmeti</h3>
        </div>
        <CategoryManager
          categories={categories}
          subcategories={subcategories}
          cardCountByCategory={cardCountByCategory}
          onAdd={onAdd}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>

      {/* Health Monitor */}
      <Suspense fallback={<TabSkeleton />}>
        <HealthMonitor />
      </Suspense>
    </div>
  );
}
