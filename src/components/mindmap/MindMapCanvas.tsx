import { useCallback, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MiniMap,
  Connection,
  Edge,
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
import { Plus, Save, ArrowLeft, GitBranch, Workflow, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const nodeTypes = { mindMapNode: MindMapNodeComponent };

let nodeId = 0;
const getId = () => `node_${Date.now()}_${++nodeId}`;

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
  const [showTemplates, setShowTemplates] = useState(false);
  const [dirty, setDirty] = useState(false);

  const mode = doc.mode || "hierarchy";
  const isProcedure = mode === "procedure";
  const templates = isProcedure ? PROCEDURE_TEMPLATES : HIERARCHY_TEMPLATES;

  const makeOnUpdate = useCallback(() => {
    return (id: string, updates: Partial<MindMapNodeData>) => {
      setNodes(nds =>
        nds.map(n => n.id === id ? { ...n, data: { ...n.data, ...updates } } : n)
      );
      setDirty(true);
    };
  }, []);

  const initialNodes = doc.nodes.map((n: any) => ({
    ...n,
    type: "mindMapNode",
    data: { ...n.data, onUpdate: makeOnUpdate() },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(doc.edges || []);
  const [editingEdge, setEditingEdge] = useState<string | null>(null);

  // Keep onUpdate reference current
  useEffect(() => {
    setNodes(nds =>
      nds.map(n => ({ ...n, data: { ...n.data, onUpdate: makeOnUpdate() } }))
    );
  }, [makeOnUpdate, setNodes]);

  // Mark dirty on node/edge changes
  const handleNodesChange: typeof onNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    if (changes.some(c => c.type !== "select")) setDirty(true);
  }, [onNodesChange]);

  const handleEdgesChange: typeof onEdgesChange = useCallback((changes) => {
    onEdgesChange(changes);
    if (changes.some(c => c.type !== "select")) setDirty(true);
  }, [onEdgesChange]);

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
        onUpdate: makeOnUpdate(),
      } as MindMapNodeData,
    };
    setNodes(nds => [...nds, newNode]);
    setDirty(true);
    setShowTemplates(false);
  }, [screenToFlowPosition, setNodes, makeOnUpdate, isProcedure]);

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
        onUpdate: makeOnUpdate(),
      } as MindMapNodeData,
    };
    setNodes(nds => [...nds, newNode]);
    setDirty(true);
  }, [screenToFlowPosition, setNodes, makeOnUpdate, isProcedure]);

  const handleSave = useCallback(async () => {
    const cleanNodes = nodes.map(({ data, ...rest }) => {
      const { onUpdate, ...cleanData } = data as any;
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

  // Auto-save every 30s if dirty
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
        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(!showTemplates)}>
            <Plus className="h-4 w-4 mr-1" />
            {isProcedure ? "Dodaj korak" : "Dodaj čvor"}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
          {showTemplates && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-popover p-2 shadow-xl animate-in fade-in-0 zoom-in-95 duration-150">
              {templates.map(t => (
                <button
                  key={t.icon}
                  onClick={() => addNodeFromTemplate(t)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-left"
                >
                  <span className="text-base">{t.label.split(" ")[0]}</span>
                  <div>
                    <p className="font-medium text-foreground">{t.desc}</p>
                  </div>
                </button>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={addBlankNode}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm hover:bg-muted transition-colors text-muted-foreground"
                >
                  <Plus className="h-4 w-4" />
                  <span>Prazan čvor</span>
                </button>
              </div>
            </div>
          )}
        </div>

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
              Prevucite između čvorova za konekcije · Dupli klik za uređivanje · Handles se pojavljuju na hover
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
          nodeTypes={nodeTypes}
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
