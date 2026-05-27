import { useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  ConnectionMode,
  BackgroundVariant,
  MarkerType,
  Panel,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import MindMapNodeComponent from "./MindMapNode";
import type { MindMapDoc } from "@/lib/db";
import ExportToCategory from "./ExportToCategory";
import { SnapGuideLines } from "./mindmap-utils";
import EdgeSettingsPanel from "./EdgeSettingsPanel";
import { MindMapToolbar, PresentationBar } from "./MindMapToolbar";
import { useMindMapCanvas } from "@/hooks/useMindMapCanvas";

const nodeTypes = { mindMapNode: MindMapNodeComponent };

function MindMapCanvasInner({ doc, onBack }: { doc: MindMapDoc; onBack: () => void }) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const ctx = useMindMapCanvas(doc);

  return (
    <div className="h-full flex flex-col">
      {!ctx.presentationMode && (
        <MindMapToolbar
          title={ctx.title}
          setTitle={ctx.setTitle}
          dirty={ctx.dirty}
          isProcedure={ctx.isProcedure}
          templates={ctx.templates}
          onBack={onBack}
          onSave={ctx.handleSave}
          onAddTemplate={ctx.addNodeFromTemplate}
          onAddBlank={ctx.addBlankNode}
          onAutoLayout={ctx.handleAutoLayout}
          onPresentation={ctx.enterPresentation}
          onExport={() => ctx.setExportOpen(true)}
          onTitleDirty={() => ctx.setDirty(true)}
        />
      )}

      {ctx.presentationMode && (
        <PresentationBar title={ctx.title} onClose={ctx.exitPresentation} />
      )}

      {/* Empty hint */}
      {ctx.nodes.length === 0 && !ctx.presentationMode && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none" style={{ top: 48 }}>
          <div className="text-center space-y-3 pointer-events-auto">
            <p className="text-muted-foreground text-sm">
              Kliknite "<strong>{ctx.isProcedure ? "Dodaj korak" : "Dodaj čvor"}</strong>" da počnete.
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
          nodes={ctx.nodes}
          edges={ctx.edges}
          onNodesChange={ctx.handleNodesChange}
          onEdgesChange={ctx.handleEdgesChange}
          onConnect={ctx.presentationMode ? undefined : ctx.onConnect}
          onEdgeClick={ctx.onEdgeClick}
          onNodeDrag={ctx.presentationMode ? undefined : ctx.onNodeDrag}
          onNodeDragStop={ctx.presentationMode ? undefined : ctx.onNodeDragStop}
          nodeTypes={nodeTypes}
          connectionMode={ConnectionMode.Loose}
          snapToGrid={!ctx.presentationMode}
          snapGrid={[15, 15]}
          fitView
          nodesDraggable={!ctx.presentationMode}
          nodesConnectable={!ctx.presentationMode}
          elementsSelectable={!ctx.presentationMode}
          deleteKeyCode={ctx.presentationMode ? [] : ["Backspace", "Delete"]}
          className="bg-background"
          connectionLineStyle={ctx.edgeStyle}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: ctx.isProcedure,
            style: ctx.edgeStyle,
            markerEnd: { type: MarkerType.ArrowClosed, color: ctx.edgeStroke, width: 20, height: 20 },
            markerStart: { type: MarkerType.ArrowClosed, color: ctx.edgeStroke, width: 20, height: 20 },
          }}
          onPaneClick={() => ctx.setSelectedEdgeId(null)}
        >
          {!ctx.presentationMode && <SnapGuideLines snapLines={ctx.snapLines} />}
          <Controls className="!bg-card !border-border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
          <Background
            variant={ctx.isProcedure ? BackgroundVariant.Lines : BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="hsl(var(--muted-foreground) / 0.1)"
          />
          <MiniMap
            className="!bg-card !border-border"
            nodeColor="hsl(var(--primary))"
            maskColor="hsl(var(--background) / 0.7)"
          />

          {ctx.selectedEdge && !ctx.presentationMode && (
            <Panel position="top-center">
              <EdgeSettingsPanel
                edge={ctx.selectedEdge}
                onUpdate={ctx.updateEdge}
                onDelete={ctx.deleteEdge}
                onClose={() => ctx.setSelectedEdgeId(null)}
              />
            </Panel>
          )}
        </ReactFlow>
      </div>

      <ExportToCategory
        open={ctx.exportOpen}
        onOpenChange={ctx.setExportOpen}
        currentTitle={ctx.title}
        currentNodes={ctx.nodes}
        currentEdges={ctx.edges}
        mode={ctx.mode}
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
