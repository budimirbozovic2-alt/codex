import { Plus, Save, ArrowLeft, GitBranch, Workflow, ChevronDown, LayoutGrid, Eye, EyeOff, Palette, Trash2, FolderDown } from "lucide-react";
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
import MindMapNodeComponent, { type MindMapNodeData, ICON_REGISTRY, type NodeShape, COLOR_OPTIONS } from "./MindMapNode";
import { MindMapDoc, MindMapEdgeRecord } from "@/lib/db";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ExportToCategory from "./ExportToCategory";
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

// ── Edge style presets ──
const EDGE_STYLES = [
  { value: "solid", label: "Puna", dashArray: undefined },
  { value: "dashed", label: "Isprekidana", dashArray: "8 4" },
  { value: "dotted", label: "Tačkasta", dashArray: "3 3" },
] as const;

const EDGE_COLORS = [
  { value: "primary", label: "Primarna", css: "hsl(var(--primary))" },
  { value: "muted", label: "Prigušena", css: "hsl(var(--muted-foreground))" },
  { value: "blue", label: "Plava", css: "hsl(210 80% 55%)" },
  { value: "green", label: "Zelena", css: "hsl(150 60% 45%)" },
  { value: "amber", label: "Žuta", css: "hsl(38 92% 50%)" },
  { value: "red", label: "Crvena", css: "hsl(0 72% 51%)" },
  { value: "purple", label: "Ljubičasta", css: "hsl(270 60% 55%)" },
] as const;

const EDGE_TYPES = [
  { value: "smoothstep", label: "Glatka" },
  { value: "straight", label: "Ravna" },
  { value: "default", label: "Bezier" },
] as const;

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
  const NODE_W = 200, NODE_H = 80, GAP_X = 80, GAP_Y = 100;
  const isHorizontal = direction === "LR";

  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();
  nodes.forEach(n => childrenOf.set(n.id, []));
  edges.forEach(e => { childrenOf.get(e.source)?.push(e.target); hasParent.add(e.target); });

  const roots = nodes.filter(n => !hasParent.has(n.id));
  if (roots.length === 0) roots.push(nodes[0]);

  const layer = new Map<string, number>();
  const queue = roots.map(r => ({ id: r.id, lvl: 0 }));
  const visited = new Set<string>();
  while (queue.length > 0) {
    const { id, lvl } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    layer.set(id, lvl);
    for (const child of (childrenOf.get(id) || [])) queue.push({ id: child, lvl: lvl + 1 });
  }
  nodes.forEach(n => { if (!layer.has(n.id)) layer.set(n.id, Math.max(...layer.values()) + 1); });

  const layers = new Map<number, string[]>();
  layer.forEach((lvl, id) => { if (!layers.has(lvl)) layers.set(lvl, []); layers.get(lvl)!.push(id); });

  const posMap = new Map<string, { x: number; y: number }>();
  [...layers.entries()].sort((a, b) => a[0] - b[0]).forEach(([lvl, ids]) => {
    const total = ids.length * (isHorizontal ? NODE_H + GAP_Y : NODE_W + GAP_X) - (isHorizontal ? GAP_Y : GAP_X);
    const start = -total / 2;
    ids.forEach((id, idx) => {
      posMap.set(id, isHorizontal
        ? { x: lvl * (NODE_W + GAP_X), y: start + idx * (NODE_H + GAP_Y) }
        : { x: start + idx * (NODE_W + GAP_X), y: lvl * (NODE_H + GAP_Y) });
    });
  });

  return nodes.map(n => ({ ...n, position: posMap.get(n.id) || n.position }));
}

// ── Edge Settings Panel ──
function EdgeSettingsPanel({ edge, onUpdate, onDelete, onClose }: {
  edge: Edge;
  onUpdate: (edgeId: string, updates: Partial<Edge>) => void;
  onDelete: (edgeId: string) => void;
  onClose: () => void;
}) {
  const currentStyle = edge.style || {} as React.CSSProperties;
  const currentDash = (currentStyle as React.CSSProperties & { strokeDasharray?: string }).strokeDasharray;
  const currentColor = (currentStyle as React.CSSProperties & { stroke?: string }).stroke || "hsl(var(--primary))";
  const currentType = edge.type || "smoothstep";

  return (
    <div className="bg-card border border-border rounded-xl shadow-xl p-4 space-y-3 w-72">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Podešavanja veze</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
      </div>

      {/* Label */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Tekst</span>
        <input
          className="w-full mt-1 bg-muted/50 rounded-md px-2 py-1.5 text-xs outline-none text-foreground focus:ring-1 focus:ring-primary"
          defaultValue={(edge.label as string) || ""}
          placeholder="npr. '15 dana' / 'Ako je usvojeno'"
          onBlur={(e) => onUpdate(edge.id, { label: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      {/* Edge type */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Tip linije</span>
        <div className="flex gap-1.5 mt-1.5">
          {EDGE_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => onUpdate(edge.id, { type: t.value })}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-medium border transition-colors",
                currentType === t.value ? "bg-primary/15 border-primary text-primary" : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Line style */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Stil</span>
        <div className="flex gap-1.5 mt-1.5">
          {EDGE_STYLES.map(s => (
            <button
              key={s.value}
              onClick={() => onUpdate(edge.id, {
                style: { ...currentStyle, strokeDasharray: s.dashArray }
              })}
              className={cn(
                "flex-1 py-1.5 rounded-md border transition-colors flex items-center justify-center",
                (currentDash || undefined) === s.dashArray ? "bg-primary/15 border-primary" : "bg-muted/50 border-border hover:border-primary/50"
              )}
            >
              <svg width="32" height="4">
                <line x1="0" y1="2" x2="32" y2="2" stroke="currentColor" strokeWidth="2"
                  strokeDasharray={s.dashArray || "none"} />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Boja</span>
        <div className="flex gap-2 mt-1.5">
          {EDGE_COLORS.map(c => (
            <button
              key={c.value}
              onClick={() => onUpdate(edge.id, {
                style: { ...currentStyle, stroke: c.css, strokeWidth: 2.5 },
                markerEnd: { type: MarkerType.ArrowClosed, color: c.css, width: 20, height: 20 },
              })}
              className={cn(
                "w-5 h-5 rounded-full border-2 border-background transition-all hover:scale-110",
                currentColor === c.css && "ring-2 ring-primary scale-110"
              )}
              style={{ backgroundColor: c.css }}
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* Animated toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Animirana</span>
        <button
          onClick={() => onUpdate(edge.id, { animated: !edge.animated })}
          className={cn(
            "w-9 h-5 rounded-full transition-colors relative",
            edge.animated ? "bg-primary" : "bg-muted"
          )}
        >
          <div className={cn(
            "w-3.5 h-3.5 rounded-full bg-background absolute top-0.5 transition-transform",
            edge.animated ? "translate-x-4" : "translate-x-0.5"
          )} />
        </button>
      </div>

      <div className="pt-2 border-t border-border">
        <button
          onClick={() => { onDelete(edge.id); onClose(); }}
          className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 transition-colors"
        >
          <Trash2 className="h-3 w-3" /> Obriši vezu
        </button>
      </div>
    </div>
  );
}

// ── Main Canvas ──
function MindMapCanvasInner({ doc, onBack }: { doc: MindMapDoc; onBack: () => void }) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [title, setTitle] = useState(doc.title);
  const [dirty, setDirty] = useState(false);
  const [deletedStack, setDeletedStack] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [presentationMode, setPresentationMode] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const mode = doc.mode || "hierarchy";
  const isProcedure = mode === "procedure";
  const templates = isProcedure ? PROCEDURE_TEMPLATES : HIERARCHY_TEMPLATES;

  // ── Stable callbacks via ref ──
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

  // ── Delete with undo ──
  const handleNodesChange: typeof onNodesChange = useCallback((changes) => {
    if (presentationMode) return; // Block changes in presentation mode
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
  }, [onNodesChange, setNodes, setEdges, stableOnUpdate, stableOnDuplicate, presentationMode]);

  const handleEdgesChange: typeof onEdgesChange = useCallback((changes) => {
    if (presentationMode) return;
    onEdgesChange(changes);
    if (changes.some(c => c.type !== "select")) setDirty(true);
  }, [onEdgesChange, presentationMode]);

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

  // ── Edge defaults ──
  const edgeStroke = isProcedure ? "hsl(var(--chart-4))" : "hsl(var(--primary))";
  const edgeStyle = { stroke: edgeStroke, strokeWidth: 2.5 };

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds =>
      addEdge({
        ...params,
        type: "smoothstep",
        animated: isProcedure,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeStroke, width: 20, height: 20 },
        markerStart: { type: MarkerType.ArrowClosed, color: edgeStroke, width: 20, height: 20 },
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

  // ── Edge update handler ──
  const updateEdge = useCallback((edgeId: string, updates: Partial<Edge>) => {
    setEdges(eds => eds.map(e => e.id === edgeId ? { ...e, ...updates } as MindMapEdgeRecord : e));
    setDirty(true);
  }, [setEdges]);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges(eds => eds.filter(e => e.id !== edgeId));
    setSelectedEdgeId(null);
    setDirty(true);
    toast.success("Veza obrisana");
  }, [setEdges]);

  // ── Node helpers ──
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

  const handleAutoLayout = useCallback((direction: "TB" | "LR") => {
    setNodes(nds => autoLayout(nds, edges, direction).map(n => ({
      ...n,
      data: { ...(n.data as any), onUpdate: stableOnUpdate, onDuplicate: stableOnDuplicate },
    })));
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

  // Auto-save 30s
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => { handleSave(); }, 30000);
    return () => clearTimeout(timer);
  }, [dirty, handleSave]);

  // Edge click → open settings
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(prev => prev === edge.id ? null : edge.id);
  }, []);

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const getTemplateIcon = (iconValue: string) => {
    const entry = ICON_REGISTRY.find(i => i.value === iconValue);
    return entry ? <entry.Icon className="h-4 w-4" /> : null;
  };

  const selectedEdge = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      {!presentationMode && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/80 backdrop-blur-sm flex-wrap">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Nazad
          </Button>

          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold",
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

          {/* Presentation mode */}
          <Button variant="outline" size="sm" onClick={() => {
            setPresentationMode(true);
            setSelectedEdgeId(null);
            setTimeout(() => fitView({ padding: 0.15, duration: 600 }), 50);
          }}>
            <Eye className="h-4 w-4 mr-1" /> Pregled
          </Button>

          {/* Auto-Layout */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <LayoutGrid className="h-4 w-4 mr-1" /> Auto-Layout
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleAutoLayout("TB")}>↓ Vertikalni (gore-dolje)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAutoLayout("LR")}>→ Horizontalni (lijevo-desno)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick-add */}
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
                  <Plus className="h-4 w-4" /> Specijalni čvorovi
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
                <Plus className="h-4 w-4 mr-2" /> Prazan čvor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export to Category */}
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <FolderDown className="h-4 w-4 mr-1" /> Eksportuj u Predmet
          </Button>

          <Button size="sm" onClick={handleSave} variant={dirty ? "default" : "outline"}>
            <Save className="h-4 w-4 mr-1" />
            {dirty ? "Sačuvaj" : "Sačuvano"}
          </Button>
        </div>
      )}

      {/* Presentation mode bar */}
      {presentationMode && (
        <div className="flex items-center justify-between px-4 py-2 bg-card/90 backdrop-blur-sm border-b border-border">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-xs text-muted-foreground">— Režim pregleda</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setPresentationMode(false)}>
            <EyeOff className="h-4 w-4 mr-1" /> Zatvori pregled
          </Button>
        </div>
      )}

      {/* Empty hint */}
      {nodes.length === 0 && !presentationMode && (
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
          onConnect={presentationMode ? undefined : onConnect}
          onEdgeClick={onEdgeClick}
          onNodeDrag={presentationMode ? undefined : onNodeDrag}
          onNodeDragStop={presentationMode ? undefined : onNodeDragStop}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          snapToGrid={!presentationMode}
          snapGrid={[15, 15]}
          fitView
          nodesDraggable={!presentationMode}
          nodesConnectable={!presentationMode}
          elementsSelectable={!presentationMode}
          deleteKeyCode={presentationMode ? [] : ["Backspace", "Delete"]}
          className="bg-background"
          connectionLineStyle={edgeStyle}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: isProcedure,
            style: edgeStyle,
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeStroke, width: 20, height: 20 },
            markerStart: { type: MarkerType.ArrowClosed, color: edgeStroke, width: 20, height: 20 },
          }}
          onPaneClick={() => setSelectedEdgeId(null)}
        >
          {!presentationMode && <SnapGuideLines snapLines={snapLines} />}
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

          {/* Edge settings panel */}
          {selectedEdge && !presentationMode && (
            <Panel position="top-center">
              <EdgeSettingsPanel
                edge={selectedEdge}
                onUpdate={updateEdge}
                onDelete={deleteEdge}
                onClose={() => setSelectedEdgeId(null)}
              />
            </Panel>
          )}
        </ReactFlow>
      </div>

      {/* Export to Category dialog */}
      <ExportToCategory
        open={exportOpen}
        onOpenChange={setExportOpen}
        currentTitle={title}
        currentNodes={nodes}
        currentEdges={edges}
        mode={mode}
      />
    </div>
  );
}

export default function MindMapCanvas(props: { doc: MindMapDoc; onBack: () => void }) {
  return (
    <ReactFlowProvider>
      <MindMapCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
