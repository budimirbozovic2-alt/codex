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

export default function SubjectsTab({
  categories,
  subcategories,
  categoryRecords,
  cardCountByCategory,
  onAdd,
  onRename,
  onDelete,
}: Props) {
  return (
    <div className="py-3.5">
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
  );
}
