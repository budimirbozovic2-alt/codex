import { FolderOpen } from "lucide-react";
import CategoryManager from "@/components/CategoryManager";
import type { CategoryRecord } from "@/lib/db-types";

interface Props {
  categories: string[];
  subcategories: Record<string, string[]>;
  categoryRecords: CategoryRecord[];
  cardCountByCategory: Record<string, number>;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}

export default function SubjectsTab({ categories, subcategories, categoryRecords, cardCountByCategory, onAdd, onRename, onDelete }: Props) {
  return (
    <div className="space-y-5">
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Predmeti</h3>
        </div>
        <CategoryManager
          categories={categories}
          subcategories={subcategories}
          categoryRecords={categoryRecords}
          cardCountByCategory={cardCountByCategory}
          onAdd={onAdd}
          onRename={onRename}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
