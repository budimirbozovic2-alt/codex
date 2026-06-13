import { 
  Plus, Trash2, Map, GitBranch, Workflow, HelpCircle 
} from "lucide-react";
import { useState } from "react";
import type { MindMapDoc, MindMapMode } from "@/lib/db-types";
import { useMindMapsByCategory } from "@/hooks/useMindMaps";
import { useMindMapMutations } from "@/hooks/mindmap/useMindMapMutations";
import { Button } from "@/components/ui/button";
import { AnimatePresence } from "@/lib/motion";
import InfoPanel from "@/components/InfoPanel";
import MindMapOnboarding from "@/components/mindmap/MindMapOnboarding";
interface Props {
  categoryId: string;
  onOpen: (doc: MindMapDoc) => void;
  showOnboarding?: boolean;
  onShowOnboarding?: () => void;
  onCloseOnboarding?: () => void;
}

export default function MindMapList({ 
  categoryId,
  onOpen, 
  showOnboarding, 
  onShowOnboarding, 
  onCloseOnboarding 
}: Props) {
  const { mindMaps: maps, ready } = useMindMapsByCategory(categoryId);
  const { save, remove } = useMindMapMutations();
  const [showCreate, setShowCreate] = useState(false);
  const loading = !ready;

  const createNew = async (mode: MindMapMode) => {
    const isHierarchy = mode === "hierarchy";
    const doc: MindMapDoc = {
      id: crypto.randomUUID(),
      categoryId,
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
  };

  const modeIcon = (mode?: MindMapMode) =>
    mode === "procedure" 
      ? <Workflow className="h-5 w-5 text-warning" /> 
      : <GitBranch className="h-5 w-5 text-primary" />;

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
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Map className="h-6 w-6 text-primary" />
            Mentalne mape
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vizuelni dijagrami za strukture i tokove postupaka.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <InfoPanel title="Mentalne mape">
              <p>
                <strong>Hijerarhija</strong> — strukture sa grananjem od vrha ka dnu (sudski sistemi).
              </p>
              <p>
                <strong>Procedura</strong> — tok postupka sa fazama, rokovima i odlučnim tačkama.
              </p>
            </InfoPanel>
            <button
              onClick={onShowOnboarding}
              className="flex items-center gap-1 text-xs text-muted-foreground"
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

      {showCreate && (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => createNew("hierarchy")}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 bg-card"
          >
            <GitBranch className="h-8 w-8 text-primary" />
            <span className="font-semibold">Hijerarhija</span>
          </button>
          <button
            onClick={() => createNew("procedure")}
            className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 bg-card"
          >
            <Workflow className="h-8 w-8 text-warning" />
            <span className="font-semibold">Procedura</span>
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" />
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
              className="flex items-center justify-between p-4 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                {modeIcon(m.mode)}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.title}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full">
                      {modeLabel(m.mode)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.nodes.length} cvorova · {m.edges.length} veza
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
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