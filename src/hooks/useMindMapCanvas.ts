import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import {
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  MarkerType,
  useReactFlow,
} from "@xyflow/react";
import { type MindMapNodeData } from "@/components/mindmap/MindMapNode";
import { MindMapDoc, MindMapEdgeRecord, type MindMapNodeRecord } from "@/lib/db";
import { saveMindMap } from "@/lib/mindmap-storage";
import { toast } from "sonner";
import { getId, HIERARCHY_TEMPLATES, PROCEDURE_TEMPLATES, type NodeTemplate } from "@/components/mindmap/mindmap-constants";
import { autoLayout } from "@/components/mindmap/mindmap-utils";

import { logger } from "@/lib/logger";
const SNAP_THRESHOLD = 20;

export function useMindMapCanvas(doc: MindMapDoc) {
  const { screenToFlowPosition, fitView } = useReactFlow();
  const [title, setTitle] = useState(doc.title);
  const [dirty, setDirty] = useState(false);
  const [deletedStack, setDeletedStack] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [presentationMode, setPresentationMode] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }>({});

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

  const initialNodes: Node[] = useMemo(() => doc.nodes.map((n) => ({
    ...(n as unknown as Node),
    type: "mindMapNode",
    data: { ...(n.data as object), onUpdate: stableOnUpdate, onDuplicate: stableOnDuplicate },
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
      const { onUpdate: _u, onDuplicate: _d, ...cleanData } = source.data as Record<string, unknown>;
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
    if (presentationMode) return;
    const removeChanges = changes.filter(c => c.type === "remove");
    if (removeChanges.length > 0) {
      setNodes(currentNodes => {
        setEdges(currentEdges => {
          const removedIds = new Set(removeChanges.map((c) => (c as { id: string }).id));
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
                    data: { ...(n.data as Record<string, unknown>), onUpdate: stableOnUpdate, onDuplicate: stableOnDuplicate },
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

  // ── Edge update/delete ──
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
      data: { ...(n.data as Record<string, unknown>), onUpdate: stableOnUpdate, onDuplicate: stableOnDuplicate },
    })));
    setDirty(true);
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
    toast.success("Automatski raspored primijenjen");
  }, [edges, setNodes, fitView, stableOnUpdate, stableOnDuplicate]);

  const handleSave = useCallback(async () => {
    try {
      const cleanNodes = nodes.map(({ data, ...rest }) => {
        const { onUpdate: _u, onDuplicate: _d, ...cleanData } = data as Record<string, unknown>;
        return { ...rest, data: cleanData };
      });
      const updated: MindMapDoc = { ...doc, title, nodes: cleanNodes, edges, updatedAt: Date.now() };
      await saveMindMap(updated);
      setDirty(false);
      toast.success("Mapa sačuvana");
    } catch (err) {
      logger.error("[mindMap] save failed", err);
      toast.error("Mapa NIJE sačuvana — pokušajte ponovo.");
      throw err;
    }
  }, [doc, title, nodes, edges]);

  // Auto-save 30s
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => { void handleSave().catch(() => { /* surfaced via toast */ }); }, 30000);
    return () => clearTimeout(timer);
  }, [dirty, handleSave]);

  // V3: Flush on unmount + beforeunload guard so route-change or window-close
  // can never silently drop the user's drawing. Refs ensure we always read the
  // freshest dirty flag and save fn without re-binding the unmount effect.
  const dirtyRef = useRef(false);
  const saveRef = useRef(handleSave);
  useEffect(() => { dirtyRef.current = dirty; saveRef.current = handleSave; }, [dirty, handleSave]);
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      // Best-effort save; browser may not await but Dexie write is queued.
      void saveRef.current().catch(() => { /* noop */ });
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (dirtyRef.current) {
        void saveRef.current().catch(() => { /* noop */ });
      }
    };
  }, []);

  // Edge click → open settings
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(prev => prev === edge.id ? null : edge.id);
  }, []);

  // Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void handleSave().catch(() => { /* surfaced via toast */ });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const selectedEdge = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) : null;

  const enterPresentation = useCallback(() => {
    setPresentationMode(true);
    setSelectedEdgeId(null);
    setTimeout(() => fitView({ padding: 0.15, duration: 600 }), 50);
  }, [fitView]);

  const exitPresentation = useCallback(() => setPresentationMode(false), []);

  return {
    // State
    title, setTitle, dirty, setDirty,
    nodes, edges,
    presentationMode, exportOpen, setExportOpen,
    snapLines, selectedEdge, selectedEdgeId,
    // Derived
    mode, isProcedure, templates, edgeStroke, edgeStyle,
    // Node handlers
    handleNodesChange, handleEdgesChange,
    onNodeDrag, onNodeDragStop,
    addNodeFromTemplate, addBlankNode, handleAutoLayout,
    // Edge handlers
    onConnect, updateEdge, deleteEdge, onEdgeClick,
    // Actions
    handleSave, enterPresentation, exitPresentation,
    setSelectedEdgeId,
  };
}
