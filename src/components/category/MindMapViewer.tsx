import { useMemo } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Controls,
  Background,
  MiniMap,
  BackgroundVariant,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import MindMapNodeComponent from "@/components/mindmap/MindMapNode";
import { MindMapDoc } from "@/lib/db";

const nodeTypes = { mindMapNode: MindMapNodeComponent };
const noop = () => {};

function ViewerInner({ doc }: { doc: MindMapDoc }) {
  const nodes = useMemo(() =>
    doc.nodes.map((n: any) => ({
      ...n,
      type: "mindMapNode",
      data: { ...n.data, onUpdate: noop, onDuplicate: noop },
    })),
    [doc.nodes]
  );

  const isProcedure = doc.mode === "procedure";

  return (
    <ReactFlow
      nodes={nodes}
      edges={doc.edges || []}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      className="bg-background"
      deleteKeyCode={[]}
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
    </ReactFlow>
  );
}

export default function MindMapViewer({ doc }: { doc: MindMapDoc }) {
  return (
    <ReactFlowProvider>
      <ViewerInner doc={doc} />
    </ReactFlowProvider>
  );
}
