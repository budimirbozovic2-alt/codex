import { useState, useEffect } from "react";
import { MindMapDoc, MindMapMode } from "@/lib/db";
import { loadMindMaps, deleteMindMap, saveMindMap } from "@/lib/mindmap-storage";
import { Button } from "@/components/ui/button";





import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Network, GitBranch, Workflow } from "lucide-react";

interface Props {
  onOpen: (doc: MindMapDoc) => void;
}

export default function MindMapList({ onOpen }: Props) {
  const [maps, setMaps] = useState<MindMapDoc[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const result = await loadMindMaps();
    setMaps(result);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const createNew = async (mode: MindMapMode) => {
    const isHierarchy = mode === "hierarchy";
    const doc: MindMapDoc = {
      id: crypto.randomUUID(),
      title: isHierarchy ? "Nova hijerarhija" : "Novi postupak",
      mode,
      nodes: [],
      edges: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveMindMap(doc);
    onOpen(doc);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteMindMap(id);
    refresh();
  };

  const modeIcon = (mode?: MindMapMode) =>
    mode === "procedure" ? <Workflow className="h-5 w-5 text-amber-500" /> : <GitBranch className="h-5 w-5 text-primary" />;

  const modeLabel = (mode?: MindMapMode) =>
    mode === "procedure" ? "Procedura" : "Hijerarhija";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            Mentalne mape
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vizuelni dijagrami za organizacione strukture i tokove postupaka.
          </p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}>
          <Plus className="h-4 w-4 mr-1" /> Nova mapa
        </Button>
      </div>

      {/* Create mode chooser */}
      {showCreate && (
        <div className="grid grid-cols-2 gap-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <button
            onClick={() => createNew("hierarchy")}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-primary bg-card hover:bg-primary/5 transition-all group"
          >
            <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <GitBranch className="h-8 w-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">Hijerarhija</p>
              <p className="text-xs text-muted-foreground mt-1">Organizacione strukture, sudski sistemi, organi vlasti</p>
            </div>
          </button>
          <button
            onClick={() => createNew("procedure")}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-amber-500 bg-card hover:bg-amber-500/5 transition-all group"
          >
            <div className="p-3 rounded-xl bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
              <Workflow className="h-8 w-8 text-amber-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">Procedura</p>
              <p className="text-xs text-muted-foreground mt-1">Tok postupka, faze, rokovi, pravni lijekovi</p>
            </div>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : maps.length === 0 && !showCreate ? (
        <div className="text-center py-16 space-y-4">
          <Network className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">Nemate nijednu mentalnu mapu.</p>
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Kreiraj prvu mapu
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {maps.map(m => (
            <div
              key={m.id}
              onClick={() => onOpen(m)}
              className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors group"
            >
              <div className="flex items-center gap-3">
                {modeIcon(m.mode)}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{m.title}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      m.mode === "procedure" ? "bg-amber-500/15 text-amber-600" : "bg-primary/15 text-primary"
                    )}>
                      {modeLabel(m.mode)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.nodes.length} čvorova · {m.edges.length} veza · {format(new Date(m.updatedAt), "dd.MM.yyyy HH:mm")}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                onClick={(e) => handleDelete(m.id, e)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
