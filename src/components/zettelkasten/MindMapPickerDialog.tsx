import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { loadMindMaps } from "@/lib/mindmap-storage";
import type { MindMapDoc } from "@/lib/db";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  onPick: (mindMapId: string, title: string) => void;
}

export default function MindMapPickerDialog({ open, onOpenChange, categoryId, onPick }: Props) {
  const [docs, setDocs] = useState<MindMapDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    loadMindMaps().then(all => {
      if (cancelled) return;
      setDocs(all.filter(d => d.categoryId === categoryId));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, categoryId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(d => d.title.toLowerCase().includes(q));
  }, [docs, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Umetni mapu uma</DialogTitle>
          <DialogDescription>
            Odaberi postojeću mapu uma ovog predmeta da je ugradiš u članak.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Pretraži mape uma…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-[340px] overflow-y-auto -mx-2 px-2 space-y-1">
          {loading ? (
            <div className="text-center text-sm text-muted-foreground py-6">Učitavanje…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              {docs.length === 0 ? "Nema mapa uma za ovaj predmet." : "Nema rezultata."}
            </div>
          ) : (
            filtered.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => { onPick(d.id, d.title); onOpenChange(false); }}
                className="w-full text-left p-3 rounded-md border border-border hover:bg-accent/50 transition-colors flex items-center gap-2"
              >
                <MapIcon className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.title}</div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {d.mode === "procedure" ? "Procedura" : "Hijerarhija"} · {d.nodes.length} čvorova
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
