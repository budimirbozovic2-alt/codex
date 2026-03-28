import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, MindMapDoc } from "@/lib/db";
import { deleteMindMap } from "@/lib/mindmap-storage";
import { Button } from "@/components/ui/button";
import { GitBranch, Eye, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import MindMapViewer from "./MindMapViewer";

interface Props {
  categoryId: string;
}

export default function CategoryMindMaps({ categoryId }: Props) {
  const maps = useLiveQuery(
    () => db.mindMaps.where("categoryId").equals(categoryId).reverse().sortBy("updatedAt"),
    [categoryId]
  ) ?? [];

  const [viewDoc, setViewDoc] = useState<MindMapDoc | null>(null);

  const handleDelete = async (id: string) => {
    await deleteMindMap(id);
    toast.success("Mapa obrisana.");
  };

  if (viewDoc) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={() => setViewDoc(null)}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Nazad na galeriju
        </Button>
        <div className="rounded-xl border border-border overflow-hidden" style={{ height: "70vh" }}>
          <MindMapViewer doc={viewDoc} />
        </div>
      </div>
    );
  }

  if (maps.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <GitBranch className="h-10 w-10 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nema mentalnih mapa u ovom predmetu.</p>
        <p className="text-xs text-muted-foreground">Koristite globalnu radionicu za mentalne mape i eksportujte ih ovdje.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {maps.map(m => (
        <div key={m.id} className="rounded-xl border border-border bg-card p-4 space-y-3 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-foreground truncate">{m.title}</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {m.nodes.length} čvor(ova) · {m.edges.length} veza
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {new Date(m.updatedAt).toLocaleDateString("sr-Latn")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" className="gap-1.5 h-7 flex-1" onClick={() => setViewDoc(m)}>
              <Eye className="h-3.5 w-3.5" /> Pregledaj
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(m.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
