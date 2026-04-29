import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Map as MapIcon, ExternalLink, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMindMap } from "@/lib/mindmap-storage";
import type { MindMapDoc } from "@/lib/db";

const MindMapViewer = lazy(() => import("@/components/category/MindMapViewer"));

interface Props {
  mindMapId: string;
  categoryId: string;
}

export default function EmbeddedMindMap({ mindMapId, categoryId }: Props) {
  const [doc, setDoc] = useState<MindMapDoc | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getMindMap(mindMapId).then(d => {
      if (!cancelled) setDoc(d ?? null);
    });
    return () => { cancelled = true; };
  }, [mindMapId]);

  if (doc === undefined) {
    return (
      <div className="my-4 rounded-md border border-border bg-card p-3 text-xs text-muted-foreground">
        Učitavanje mape uma…
      </div>
    );
  }

  if (doc === null) {
    return (
      <div className="my-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 flex items-center gap-2 text-xs text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Mapa uma nije pronađena (id: <code className="font-mono">{mindMapId}</code>)
      </div>
    );
  }

  return (
    <div className="my-4 rounded-md border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <MapIcon className="h-4 w-4 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{doc.title}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Mapa uma · {doc.mode === "procedure" ? "Procedura" : "Hijerarhija"}
          </div>
        </div>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 text-xs">
          <Link to={`/subject/${categoryId}/mind-maps`}>
            <ExternalLink className="h-3.5 w-3.5" />
            Otvori
          </Link>
        </Button>
      </div>
      <div className="h-[320px] w-full">
        <Suspense fallback={
          <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
            Učitavanje pregleda…
          </div>
        }>
          <MindMapViewer doc={doc} />
        </Suspense>
      </div>
    </div>
  );
}
