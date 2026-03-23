import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Connection,
  ConnectionMode,
  Edge,
  Node,
  BackgroundVariant,
  MarkerType,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import MindMapNodeComponent, { type MindMapNodeData } from "./MindMapNode";
import { MindMapDoc } from "@/lib/db";
import { saveMindMap } from "@/lib/mindmap-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Save, ArrowLeft, GitBranch, Workflow, ChevronDown, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const nodeTypes = { mindMapNode: MindMapNodeComponent };

let nodeIdCounter = 0;
const getId = () => `node_${Date.now()}_${++nodeIdCounter}`;

// ── Mode-specific quick-add templates ──
const HIERARCHY_TEMPLATES = [
  { label: "⚖️ Sud", icon: "scale", color: "blue", desc: "Sudska institucija" },
  { label: "🏢 Organ", icon: "building", color: "green", desc: "Upravni organ" },
  { label: "📄 Odluka", icon: "document", color: "default", desc: "Akt ili odluka" },
  { label: "👤 Lice", icon: "person", color: "purple", desc: "Službeno lice ili stranka" },
];

const PROCEDURE_TEMPLATES = [
  { label: "➡️ Korak", icon: "arrow", color: "blue", desc: "Faza postupka" },
  { label: "❓ Odluka", icon: "question", color: "amber", desc: "Tačka odlučivanja" },
  { label: "🕒 Rok", icon: "clock", color: "red", desc: "Rokovi i ograničenja" },
  { label: "✅ Završetak", icon: "check", color: "green", desc: "Završna faza" },
  { label: "📄 Dokument", icon: "document", color: "default", desc: "Podnesak ili akt" },
];

interface Props {
  doc: MindMapDoc;
  onBack: () => void;
}

function MindMapCanvasInner({ doc, onBack }: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const [title, setTitle] = useState(doc.title);
  const [dirty, setDirty] = useState(false);
  const [deletedStack, setDeletedStack] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);

  const mode = doc.mode || "hierarchy";
  const isProcedure = mode === "procedure";
  const templates = isProcedure ? PROCEDURE_TEMPLATES : HIERARCHY_TEMPLATES;

  // ── Stable onUpdate/onDuplicate via ref ──
  const onUpdateRef = useRef<(id: string, updates: Partial<MindMapNodeData>) => void>(() => {});
  const onDuplicateRef = useRef<(id: string) => void>(() => {});

  // Wrapper functions that delegate to refs (stable identity)
  const stableOnUpdate = useCallback((id: string, updates: Partial<MindMapNodeData>) => {
    onUpdateRef.current(id, updates);
  }, []);
  const stableOnDuplicate = useCallback((id: string) => {
    onDuplicateRef.current(id);
  }, []);

  const initialNodes = useMemo(() => doc.nodes.map((n: any) => ({
    ...n,
    type: "mindMapNode",
    data: { ...n.data, onUpdate: stableOnUpdate, onDuplicate: stableOnDuplicate },
  })), [doc.nodes, stableOnUpdate, stableOnDuplicate]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(doc.edges || []);
  const [editingEdge, setEditingEdge] = useState<string | null>(null);

  // Keep ref implementations current
  onUpdateRef.current = (id: string, updates: Partial<MindMapNodeData>) => {
    setNodes(nds =>
      nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...updates } } : n)
    );
    setDirty(true);
  };

  onDuplicateRef.current = (id: string) => {
    setNodes(nds => {
      const source = nds.find(n => n.id === id);
      if (!source) return nds;
      const { onUpdate, onDuplicate, ...cleanData } = source.data as any;
      const newNode: Node = {
        ...source,
        id: getId(),
        position: { x: source.position.x + 40, y: source.position.y + 40 },
        selected: false,
        data: { ...cleanData, onUpdate: stableOnUpdate, onDuplicate: stableOnDuplicate },
      };
      return [...nds, newNode];
    });
    setDirty(true);
    toast.success("Čvor duplikovan");
  };

  // ── Delete interception with Undo ──
  const handleNodesChange: typeof onNodesChange = useCallback((changes) => {
    const removeChanges = changes.filter(c => c.type === "remove");
    if (removeChanges.length > 0) {
      // Capture nodes & connected edges before removal
      setNodes(currentNodes => {
        setEdges(currentEdges => {
          const removedIds = new Set(removeChanges.map((c: any) => c.id));
          const removedNodes = currentNodes.filter(n => removedIds.has(n.id));
          const removedEdges = currentEdges.filter(e => removedIds.has(e.source) || removedIds.has(e.target));
          if (removedNodes.length > 0) {
            setDeletedStack(prev => [...prev.slice(-9), { nodes: removedNodes, edges: removedEdges }]);
            toast("Obrisano " + removedNodes.length + " čvor(ova)", {
              action: {
                label: "Vrati",
                onClick: () => {
                  setNodes(nds => [...nds, ...removedNodes.map(n => ({
                    ...n,
                    data: { ...(n.data as any), onUpdate: stableOnUpdate, onDuplicate: stableOnDuplicate },
                  }))]);
                  setEdges(eds => [...eds, ...removedEdges]);
                  setDirty(true);
                },
              },
              duration: 5000,
            });
          }
          return currentEdges;
        });
        return currentNodes;
      });
    }
    onNodesChange(changes);
    if (changes.some(c => c.type !== "select")) setDirty(true);
  }, [onNodesChange, setNodes, setEdges, stableOnUpdate, stableOnDuplicate]);

  const handleEdgesChange: typeof onEdgesChange = useCallback((changes) => {
    onEdgesChange(changes);
    if (changes.some(c => c.type !== "select")) setDirty(true);
  }, [onEdgesChange]);

  // ── Snap nearly-aligned nodes to perfect alignment ──
  const SNAP_THRESHOLD = 20; // px tolerance
  const onNodeDragStop = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    setNodes(nds => {
      const others = nds.filter(n => n.id !== draggedNode.id);
      let { x, y } = draggedNode.position;
      let snappedX = false;
      let snappedY = false;

      for (const other of others) {
        if (!snappedX && Math.abs(other.position.x - x) <= SNAP_THRESHOLD) {
          x = other.position.x;
          snappedX = true;
        }
        if (!snappedY && Math.abs(other.position.y - y) <= SNAP_THRESHOLD) {
          y = other.position.y;
          snappedY = true;
        }
        if (snappedX && snappedY) break;
      }

      if (!snappedX && !snappedY) return nds;
      return nds.map(n =>
        n.id === draggedNode.id ? { ...n, position: { x, y } } : n
      );
    });
  }, [setNodes]);

  const edgeStyle = isProcedure
    ? { stroke: "hsl(var(--chart-4))", strokeWidth: 2.5 }
    : { stroke: "hsl(var(--primary))", strokeWidth: 2 };

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges(eds =>
        addEdge(
          {
            ...params,
            type: isProcedure ? "smoothstep" : "default",
            animated: isProcedure,
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyle.stroke },
            style: edgeStyle,
            label: "",
            labelStyle: { fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 500 },
            labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.95 },
            labelBgPadding: [6, 3] as [number, number],
            labelBgBorderRadius: 6,
          },
          eds
        )
      );
      setDirty(true);
    },
    [setEdges, isProcedure, edgeStyle]
  );

  const addNodeFromTemplate = useCallback((template: typeof HIERARCHY_TEMPLATES[0]) => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
      y: window.innerHeight / 3 + (Math.random() - 0.5) * 100,
    });
    const newNode = {
      id: getId(),
      type: "mindMapNode",
      position,
      data: {
        label: template.desc,
        description: "",
        icon: template.icon,
        color: template.color,
        shape: isProcedure ? "rounded" : "rectangle",
        onUpdate: stableOnUpdate,
        onDuplicate: stableOnDuplicate,
      } as MindMapNodeData,
    };
    setNodes(nds => [...nds, newNode]);
    setDirty(true);
    // dropdown closes automatically via DropdownMenu
  }, [screenToFlowPosition, setNodes, stableOnUpdate, stableOnDuplicate, isProcedure]);

  const addBlankNode = useCallback(() => {
    const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
    const newNode = {
      id: getId(),
      type: "mindMapNode",
      position,
      data: {
        label: "Novi čvor",
        description: "",
        icon: isProcedure ? "arrow" : "document",
        color: "default",
        shape: isProcedure ? "rounded" : "rectangle",
        onUpdate: stableOnUpdate,
        onDuplicate: stableOnDuplicate,
      } as MindMapNodeData,
    };
    setNodes(nds => [...nds, newNode]);
    setDirty(true);
  }, [screenToFlowPosition, setNodes, stableOnUpdate, stableOnDuplicate, isProcedure]);

  const handleSave = useCallback(async () => {
    const cleanNodes = nodes.map(({ data, ...rest }) => {
      const { onUpdate, onDuplicate, ...cleanData } = data as any;
      return { ...rest, data: cleanData };
    });
    const updated: MindMapDoc = {
      ...doc,
      title,
      nodes: cleanNodes,
      edges,
      updatedAt: Date.now(),
    };
    await saveMindMap(updated);
    setDirty(false);
    toast.success("Mapa sačuvana");
  }, [doc, title, nodes, edges]);

  // Auto-save debounce: 30s after last change
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => { handleSave(); }, 30000);
    return () => clearTimeout(timer);
  }, [dirty, handleSave]);

  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setEditingEdge(edge.id);
  }, []);

  const updateEdgeLabel = useCallback((edgeId: string, label: string) => {
    setEdges(eds => eds.map(e => e.id === edgeId ? { ...e, label } : e));
    setEditingEdge(null);
    setDirty(true);
  }, [setEdges]);

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 backdrop-blur-sm flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Nazad
        </Button>

        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
          isProcedure ? "bg-amber-500/15 text-amber-600" : "bg-primary/15 text-primary"
        )}>
          {isProcedure ? <Workflow className="h-3.5 w-3.5" /> : <GitBranch className="h-3.5 w-3.5" />}
          {isProcedure ? "Procedura" : "Hijerarhija"}
        </div>

        <Input
          value={title}
          onChange={e => { setTitle(e.target.value); setDirty(true); }}
          className="max-w-[240px] h-8 text-sm font-semibold"
          placeholder="Naziv mape..."
        />

        <div className="flex-1" />

        {/* Quick-add templates */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              {isProcedure ? "Dodaj korak" : "Dodaj čvor"}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {templates.map(t => (
              <DropdownMenuItem
                key={t.icon}
                onClick={() => addNodeFromTemplate(t)}
                className="flex items-center gap-2.5"
              >
                <span className="text-base">{t.label.split(" ")[0]}</span>
                <span className="font-medium">{t.desc}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={addBlankNode} className="text-muted-foreground">
              <Plus className="h-4 w-4 mr-2" />
              Prazan čvor
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" onClick={handleSave} variant={dirty ? "default" : "outline"}>
          <Save className="h-4 w-4 mr-1" />
          {dirty ? "Sačuvaj" : "Sačuvano"}
        </Button>
      </div>

      {/* Hint for empty canvas */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none" style={{ top: 48 }}>
          <div className="text-center space-y-3 pointer-events-auto">
            <p className="text-muted-foreground text-sm">
              Kliknite "<strong>{isProcedure ? "Dodaj korak" : "Dodaj čvor"}</strong>" da počnete.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Prevucite od handle-a do handle-a za konekcije · Dupli klik za uređivanje · Delete za brisanje
            </p>
          </div>
        </div>
      )}

      {/* Canvas */}
      <div ref={reactFlowWrapper} className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          snapToGrid
          snapGrid={[15, 15]}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          className="bg-background"
          connectionLineStyle={edgeStyle}
          defaultEdgeOptions={{
            type: isProcedure ? "smoothstep" : "default",
            animated: isProcedure,
          }}
        >
          <Controls className="!bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
          <Background
            variant={isProcedure ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="hsl(var(--muted-foreground) / 0.1)"
          />
          <MiniMap
            className="!bg-card !border-border"
            nodeColor="hsl(var(--primary))"
            maskColor="hsl(var(--background) / 0.7)"
          />
          {/* Edge label editor */}
          {editingEdge && (
            <Panel position="top-center">
              <div className="bg-card border border-border rounded-lg shadow-lg p-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {isProcedure ? "Naziv koraka / rok:" : "Tekst veze:"}
                </span>
                <input
                  autoFocus
                  className="bg-transparent border-b border-primary text-sm outline-none text-foreground w-48"
                  defaultValue={(edges.find(e => e.id === editingEdge)?.label as string) || ""}
                  placeholder={isProcedure ? "npr. '15 dana'" : "npr. 'nadređeni'"}
                  onBlur={(e) => updateEdgeLabel(editingEdge, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingEdge(null);
                  }}
                />
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export default function MindMapCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <MindMapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
