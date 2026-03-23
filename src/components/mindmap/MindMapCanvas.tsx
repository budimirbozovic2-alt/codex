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
import MindMapNodeComponent, { type MindMapNodeData, ICON_REGISTRY, type NodeShape } from "./MindMapNode";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Save, ArrowLeft, GitBranch, Workflow, ChevronDown, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const nodeTypes = { mindMapNode: MindMapNodeComponent };

let nodeIdCounter = 0;
const getId = () => `node_${Date.now()}_${++nodeIdCounter}`;

// ── Mode-specific quick-add templates ──
interface NodeTemplate {
  label: string;
  icon: string;
  color: string;
  desc: string;
  shape: NodeShape;
}

const HIERARCHY_TEMPLATES: NodeTemplate[] = [
  { label: "Sud", icon: "scale", color: "blue", desc: "Sudska institucija", shape: "rectangle" },
  { label: "Organ", icon: "building", color: "green", desc: "Upravni organ", shape: "rectangle" },
  { label: "Odluka", icon: "file-text", color: "default", desc: "Akt ili odluka", shape: "rectangle" },
  { label: "Lice", icon: "user", color: "purple", desc: "Službeno lice ili stranka", shape: "rectangle" },
];

const PROCEDURE_TEMPLATES: NodeTemplate[] = [
  { label: "Korak", icon: "arrow-right", color: "blue", desc: "Faza postupka", shape: "rounded" },
  { label: "Odluka", icon: "question", color: "amber", desc: "Tačka odlučivanja", shape: "diamond" },
  { label: "Rok", icon: "calendar", color: "red", desc: "Rokovi i ograničenja", shape: "rectangle" },
  { label: "Završetak", icon: "check", color: "green", desc: "Završna faza", shape: "rounded" },
  { label: "Dokument", icon: "file-text", color: "default", desc: "Podnesak ili akt", shape: "rectangle" },
  { label: "Žalba", icon: "refresh", color: "purple", desc: "Pravni lijek", shape: "rounded" },
];

const SPECIAL_TEMPLATES: NodeTemplate[] = [
  { label: "Uslovni čvor", icon: "question", color: "amber", desc: "If/else odluka", shape: "diamond" },
  { label: "Grupa (faza)", icon: "file-text", color: "blue", desc: "Kontejner za pod-korake", shape: "group" },
];

interface Props {
  doc: MindMapDoc;
  onBack: () => void;
}

// ── Snap guide lines ──
function SnapGuideLines({ snapLines }: { snapLines: { x?: number; y?: number } }) {
  const { getViewport } = useReactFlow();
  if (snapLines.x === undefined && snapLines.y === undefined) return null;
  const { x: tx, y: ty, zoom } = getViewport();
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1000 }}>
      {snapLines.x !== undefined && (
        <line x1={snapLines.x * zoom + tx} y1={0} x2={snapLines.x * zoom + tx} y2={9999}
          stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="6 3" opacity={0.5} />
      )}
      {snapLines.y !== undefined && (
        <line x1={0} y1={snapLines.y * zoom + ty} x2={9999} y2={snapLines.y * zoom + ty}
          stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="6 3" opacity={0.5} />
      )}
    </svg>
  );
}

// ── Auto-Layout (simple layered/dagre-like) ──
function autoLayout(nodes: Node[], edges: Edge[], direction: "TB" | "LR" = "TB"): Node[] {
  if (nodes.length === 0) return nodes;

  const NODE_W = 200;
  const NODE_H = 80;
  const GAP_X = 80;
  const GAP_Y = 100;
  const isHorizontal = direction === "LR";

  // Build adjacency
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  nodes.forEach(n => childrenOf.set(n.id, []));
  edges.forEach(e => {
    childrenOf.get(e.source)?.push(e.target);
    hasParent.add(e.target);
  });

  // Find roots
  const roots = nodes.filter(n => !hasParent.has(n.id));
  if (roots.length === 0) roots.push(nodes[0]);

  // BFS assign layers
  const layer = new Map<string, number>();
  const queue = roots.map(r => ({ id: r.id, lvl: 0 }));
  const visited = new Set<string>();
  while (queue.length > 0) {
    const { id, lvl } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    layer.set(id, lvl);
    for (const child of (childrenOf.get(id) || [])) {
      queue.push({ id: child, lvl: lvl + 1 });
    }
  }

  // Unvisited nodes get placed at bottom
  nodes.forEach(n => { if (!layer.has(n.id)) layer.set(n.id, (layer.size > 0 ? Math.max(...layer.values()) + 1 : 0)); });

  // Group by layer
  const layers = new Map<number, string[]>();
  layer.forEach((lvl, id) => {
    if (!layers.has(lvl)) layers.set(lvl, []);
    layers.get(lvl)!.push(id);
  });

  // Position
  const posMap = new Map<string, { x: number; y: number }>();
  const sortedLayers = [...layers.entries()].sort((a, b) => a[0] - b[0]);
  
  sortedLayers.forEach(([lvl, ids]) => {
    const totalWidth = ids.length * (isHorizontal ? NODE_H + GAP_Y : NODE_W + GAP_X) - (isHorizontal ? GAP_Y : GAP_X);
    const startOffset = -totalWidth / 2;

    ids.forEach((id, idx) => {
      if (isHorizontal) {
        posMap.set(id, {
          x: lvl * (NODE_W + GAP_X),
          y: startOffset + idx * (NODE_H + GAP_Y),
        });
      } else {
        posMap.set(id, {
          x: startOffset + idx * (NODE_W + GAP_X),
          y: lvl * (NODE_H + GAP_Y),
        });
      }
    });
  });

  return nodes.map(n => ({
    ...n,
    position: posMap.get(n.id) || n.position,
  }));
}

function MindMapCanvasInner({ doc, onBack }: Props) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [title, setTitle] = useState(doc.title);
  const [dirty, setDirty] = useState(false);
  const [deletedStack, setDeletedStack] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);

  const mode = doc.mode || "hierarchy";
  const isProcedure = mode === "procedure";
  const templates = isProcedure ? PROCEDURE_TEMPLATES : HIERARCHY_TEMPLATES;

  // ── Stable onUpdate/onDuplicate via ref ──
  const onUpdateRef = useRef<(id: string, updates: Partial<MindMapNodeData>) => void>(() => {});
  const onDuplicateRef = useRef<(id: string) => void>(() => {});

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

  onUpdateRef.current = (id: string, updates: Partial<MindMapNodeData>) => {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...updates } } : n));
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

  // ── Snap guides ──
  const SNAP_THRESHOLD = 20;
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});

  const onNodeDrag = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    const others = nodes.filter(n => n.id !== draggedNode.id);
    const { x, y } = draggedNode.position;
    let snapX: number | undefined, snapY: number | undefined;
    for (const other of others) {
      if (snapX === undefined && Math.abs(other.position.x - x) <= SNAP_THRESHOLD) snapX = other.position.x;
      if (snapY === undefined && Math.abs(other.position.y - y) <= SNAP_THRESHOLD) snapY = other.position.y;
      if (snapX !== undefined && snapY !== undefined) break;
    }
    setSnapLines({ x: snapX, y: snapY });
  }, [nodes]);

  const onNodeDragStop = useCallback((_event: React.MouseEvent, draggedNode: Node) => {
    setSnapLines({});
    setNodes(nds => {
      const others = nds.filter(n => n.id !== draggedNode.id);
      let { x, y } = draggedNode.position;
      let sx = false, sy = false;
      for (const other of others) {
        if (!sx && Math.abs(other.position.x - x) <= SNAP_THRESHOLD) { x = other.position.x; sx = true; }
        if (!sy && Math.abs(other.position.y - y) <= SNAP_THRESHOLD) { y = other.position.y; sy = true; }
        if (sx && sy) break;
      }
      if (!sx && !sy) return nds;
      return nds.map(n => n.id === draggedNode.id ? { ...n, position: { x, y } } : n);
    });
  }, [setNodes]);

  // ── Edge styles — all SmoothStep with arrows ──
  const edgeStroke = isProcedure ? "hsl(var(--chart-4))" : "hsl(var(--primary))";
  const edgeStyle = { stroke: edgeStroke, strokeWidth: 2.5 };

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds =>
      addEdge({
        ...params,
        type: "smoothstep",
        animated: isProcedure,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStroke, width: 20, height: 20 },
        style: edgeStyle,
        label: "",
        labelStyle: { fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 500 },
        labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.95 },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 6,
      }, eds)
    );
    setDirty(true);
  }, [setEdges, isProcedure, edgeStroke]);

  const addNodeFromTemplate = useCallback((template: NodeTemplate) => {
    const position = screenToFlowPosition({
      x: window.innerWidth / 2 + (Math.random() - 0.5) * 200,
      y: window.innerHeight / 3 + (Math.random() - 0.5) * 100,
    });
    const newNode: Node = {
      id: getId(),
      type: "mindMapNode",
      position,
      data: {
        label: template.desc,
        description: "",
        icon: template.icon,
        color: template.color,
        shape: template.shape,
        onUpdate: stableOnUpdate,
        onDuplicate: stableOnDuplicate,
      } as MindMapNodeData,
      ...(template.shape === "group" ? { style: { width: 300, height: 200 } } : {}),
    };
    setNodes(nds => [...nds, newNode]);
    setDirty(true);
  }, [screenToFlowPosition, setNodes, stableOnUpdate, stableOnDuplicate]);

  const addBlankNode = useCallback(() => {
    const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 3 });
    const newNode: Node = {
      id: getId(),
      type: "mindMapNode",
      position,
      data: {
        label: "Novi čvor",
        description: "",
        icon: isProcedure ? "arrow-right" : "file-text",
        color: "default",
        shape: isProcedure ? "rounded" : "rectangle",
        onUpdate: stableOnUpdate,
        onDuplicate: stableOnDuplicate,
      } as MindMapNodeData,
    };
    setNodes(nds => [...nds, newNode]);
    setDirty(true);
  }, [screenToFlowPosition, setNodes, stableOnUpdate, stableOnDuplicate, isProcedure]);

  // ── Auto-Layout handler ──
  const handleAutoLayout = useCallback((direction: "TB" | "LR") => {
    setNodes(nds => {
      const layouted = autoLayout(nds, edges, direction);
      return layouted.map(n => ({
        ...n,
        data: { ...(n.data as any), onUpdate: stableOnUpdate, onDuplicate: stableOnDuplicate },
      }));
    });
    setDirty(true);
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
    toast.success("Automatski raspored primijenjen");
  }, [edges, setNodes, fitView, stableOnUpdate, stableOnDuplicate]);

  const handleSave = useCallback(async () => {
    const cleanNodes = nodes.map(({ data, ...rest }) => {
      const { onUpdate, onDuplicate, ...cleanData } = data as any;
      return { ...rest, data: cleanData };
    });
    const updated: MindMapDoc = { ...doc, title, nodes: cleanNodes, edges, updatedAt: Date.now() };
    await saveMindMap(updated);
    setDirty(false);
    toast.success("Mapa sačuvana");
  }, [doc, title, nodes, edges]);

  // Auto-save debounce: 30s
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

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  // Get icon component for template display
  const getTemplateIcon = (iconValue: string) => {
    const entry = ICON_REGISTRY.find(i => i.value === iconValue);
    return entry ? <entry.Icon className="h-4 w-4" /> : null;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 backdrop-blur-sm flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Nazad
        </Button>

        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium",
          isProcedure ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/15 text-primary"
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

        {/* Auto-Layout */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" title="Automatski raspored čvorova">
              <LayoutGrid className="h-4 w-4 mr-1" />
              Auto-Layout
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleAutoLayout("TB")}>
              ↓ Vertikalni raspored (gore-dolje)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAutoLayout("LR")}>
              → Horizontalni raspored (lijevo-desno)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

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
              <DropdownMenuItem key={t.icon + t.shape} onClick={() => addNodeFromTemplate(t)} className="flex items-center gap-2.5">
                {getTemplateIcon(t.icon)}
                <span className="font-medium">{t.desc}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Specijalni čvorovi</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {SPECIAL_TEMPLATES.map(t => (
                  <DropdownMenuItem key={t.shape} onClick={() => addNodeFromTemplate(t)} className="flex items-center gap-2.5">
                    {getTemplateIcon(t.icon)}
                    <div>
                      <span className="font-medium">{t.label}</span>
                      <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
          onNodeDrag={onNodeDrag}
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
            type: "smoothstep",
            animated: isProcedure,
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeStroke, width: 20, height: 20 },
          }}
        >
          <SnapGuideLines snapLines={snapLines} />
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
                  placeholder={isProcedure ? "npr. '15 dana' / 'Ako je usvojeno'" : "npr. 'nadređeni'"}
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
