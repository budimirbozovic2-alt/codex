import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, Map as MapIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadMindMaps } from "@/lib/mindmap-storage";
import type { MindMapDoc } from "@/lib/db";

const MindMapViewer = lazy(() => import("@/components/category/MindMapViewer"));

interface Props {
  categoryId: string;
  onClose: () => void;
}

/**
 * Side panel that lists subject-scoped mind maps and renders the picked one
 * via the lazy MindMapViewer. Used inside PassiveReader.
 */
export default function MindMapSidePanel({ categoryId, onClose }: Props) {
  const [docs, setDocs] = useState<MindMapDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadMindMaps().then(all => {
      if (cancelled) return;
      setDocs(all.filter(d => d.categoryId === categoryId));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [categoryId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(d => d.title.toLowerCase().includes(q));
  }, [docs, search]);

  const picked = pickedId ? docs.find(d => d.id === pickedId) ?? null : null;

  return (
    <div className="flex flex-col h-full border border-border rounded-md bg-card overflow-hidden min-h-[420px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30 shrink-0">
        {picked ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setPickedId(null)}
            className="h-7 gap-1 text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Sve mape
          </Button>
        ) : (
          <MapIcon className="h-4 w-4 text-primary shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">
            {picked ? picked.title : "Mape uma"}
          </div>
          {picked && (
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {picked.mode === "procedure" ? "Procedura" : "Hijerarhija"} · {picked.nodes.length} čvorova
            </div>
          )}
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
          <Link to={`/subject/${categoryId}/mind-maps`}>
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Sve mape</span>
          </Link>
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onClose}
          className="h-7 w-7"
          aria-label="Zatvori bočni prikaz mapa uma"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {picked ? (
        <div className="flex-1 min-h-[360px]">
          <Suspense fallback={
            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
              Učitavanje pregleda…
            </div>
          }>
            <MindMapViewer doc={picked} />
          </Suspense>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="p-2 border-b border-border">
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Pretraži mape uma…"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
                  onClick={() => setPickedId(d.id)}
                  className="w-full text-left p-2.5 rounded-md border border-border hover:bg-accent/50 transition-colors flex items-center gap-2"
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
        </div>
      )}
    </div>
  );
}
