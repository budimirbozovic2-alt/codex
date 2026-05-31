import { Plus, Trash2, Map, GitBranch, Workflow, HelpCircle } from "lucide-react";
import { useState } from "react";
import type { MindMapDoc, MindMapMode } from "@/lib/db-types";
import { useMindMaps } from "@/hooks/useMindMaps";
import { useMindMapMutations } from "@/hooks/mindmap/useMindMapMutations";
import { Button } from "@/components/ui/button";
import { AnimatePresence } from "@/lib/motion";
import InfoPanel from "@/components/InfoPanel";
import MindMapOnboarding from "@/components/mindmap/MindMapOnboarding";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
  onOpen: (doc: MindMapDoc) => void;
  showOnboarding?: boolean;
  onShowOnboarding?: () => void;
  onCloseOnboarding?: () => void;
}

export default function MindMapList({ onOpen, showOnboarding, onShowOnboarding, onCloseOnboarding }: Props) {
  const { mindMaps: maps, ready } = useMindMaps();
  const { save, remove } = useMindMapMutations();
  const [showCreate, setShowCreate] = useState(false);
  const loading = !ready;

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
    await save.mutateAsync(doc);
    onOpen(doc);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await remove.mutateAsync(id);
    // Listener auto-refreshes the list — no manual refresh() call.
  };

  const modeIcon = (mode?: MindMapMode) =>
    mode === "procedure" ? <Workflow className="h-5 w-5 text-warning" /> : <GitBranch className="h-5 w-5 text-primary" />;

  const modeLabel = (mode?: MindMapMode) =>
    mode === "procedure" ? "Procedura" : "Hijerarhija";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <AnimatePresence>
        {showOnboarding && onCloseOnboarding && (
          <MindMapOnboarding onComplete={onCloseOnboarding} />
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Map className="h-6 w-6 text-primary" />
            Mentalne mape
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vizuelni dijagrami za organizacione strukture i tokove postupaka.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <InfoPanel title="Mentalne mape">
              <p><strong>Hijerarhija</strong> — organizacione strukture sa grananjem od vrha ka dnu (sudski sistemi, organi vlasti).</p>
              <p><strong>Procedura</strong> — tok postupka sa fazama, rokovima i odlučnim tačkama.</p>
              <p>Dvoklik na canvas dodaje novi čvor. Povuci iz handle-a za nove veze.</p>
              <p>Gotove mape možeš eksportovati kao kartice u bazu podataka.</p>
            </InfoPanel>
            <button
              onClick={onShowOnboarding}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
              title="Vodič kroz mentalne mape"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Onboarding</span>
            </button>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-1" /> Nova mapa
          </Button>
        </div>
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
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border hover:border-warning bg-card hover:bg-warning/5 transition-all group"
          >
            <div className="p-3 rounded-xl bg-warning/10 group-hover:bg-warning/20 transition-colors">
              <Workflow className="h-8 w-8 text-warning" />
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
          <Map className="h-12 w-12 mx-auto text-muted-foreground/40" />
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
                      m.mode === "procedure" ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"
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
