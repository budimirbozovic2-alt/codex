import { Copy } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Handle, Position, type NodeProps, NodeResizer } from "@xyflow/react";
import { cn } from "@/lib/utils";
import {
  COLOR_OPTIONS,
  ICON_REGISTRY,
  type MindMapNodeData,
  type NodeShape,
  pickColor,
  pickIcon,
} from "./node/icon-registry";
import { SettingsPanel } from "./node/SettingsPanel";
import { useNodeEditing } from "@/hooks/mindmap/useNodeEditing";

// Re-export for legacy consumers importing from the component module.
export { ICON_REGISTRY, COLOR_OPTIONS, type NodeShape, type MindMapNodeData };

const handleBase =
  "!w-3 !h-3 !min-w-[12px] !min-h-[12px] !border-2 !border-background !rounded-full !bg-primary opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:!scale-125 transition-all duration-200 z-20";

function MindMapNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData;
  const {
    nodeRef, editing, startEditing,
    draftLabel, setDraftLabel, draftDesc, setDraftDesc,
    commitAndClose, cancelEditing, stopPropagation,
  } = useNodeEditing(id, nodeData);
  const [showSettings, setShowSettings] = useState(false);
  const [iconSearch, setIconSearch] = useState("");

  const colorOpt = pickColor(nodeData.color);
  const shape = (nodeData.shape || "rectangle") as NodeShape;
  const iconEntry = pickIcon(nodeData.icon);

  const updateField = useCallback((field: string, value: string) => {
    nodeData.onUpdate?.(id, { [field]: value });
  }, [id, nodeData]);

  const handles = (
    <>
      <Handle type="target" position={Position.Top} id="top" className={handleBase} style={{ top: -6 }} />
      <Handle type="source" position={Position.Right} id="right" className={handleBase} style={{ right: -6 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleBase} style={{ bottom: -6 }} />
      <Handle type="target" position={Position.Left} id="left" className={handleBase} style={{ left: -6 }} />
    </>
  );

  const labelInput = (extraClass = "") => (
    <input
      autoFocus
      className={cn("bg-transparent border-b border-primary text-xs font-bold w-full outline-none text-foreground nodrag nowheel nopan", extraClass)}
      value={draftLabel}
      onChange={(e) => setDraftLabel(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commitAndClose();
        if (e.key === "Escape") cancelEditing();
      }}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
    />
  );

  const descTextarea = (extraClass = "", rows = 2) => (
    <textarea
      className={cn("bg-transparent border border-border rounded-lg text-xs w-full outline-none text-foreground p-1.5 resize-none focus:ring-1 focus:ring-primary nodrag nowheel nopan", extraClass)}
      rows={rows}
      value={draftDesc}
      onChange={(e) => setDraftDesc(e.target.value)}
      placeholder="Opis..."
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") cancelEditing(); }}
      onMouseDown={stopPropagation}
      onPointerDown={stopPropagation}
    />
  );

  // ── GROUP NODE ──
  if (shape === "group") {
    return (
      <div
        ref={nodeRef}
        className={cn(
          "group relative border-2 border-dashed rounded-xl transition-all duration-200",
          colorOpt.border,
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
        style={{ minWidth: 250, minHeight: 150, background: "hsl(var(--muted) / 0.25)" }}
        onDoubleClick={startEditing}
      >
        <NodeResizer
          minWidth={200}
          minHeight={120}
          isVisible={!!selected}
          lineClassName="!border-primary"
          handleClassName="!w-2.5 !h-2.5 !bg-primary !border-background !rounded-sm"
        />
        {handles}
        <div className="px-3 py-2 border-b border-dashed border-inherit bg-muted/40 rounded-t-xl backdrop-blur-sm">
          {editing
            ? labelInput("text-xs uppercase tracking-wider")
            : <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{nodeData.label}</span>}
        </div>
        {selected && (
          <div className="absolute bottom-1.5 right-2 flex gap-1.5">
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateField("color", opt.value)}
                className={cn("w-4 h-4 rounded-full border-2 transition-transform hover:scale-110", opt.bg, opt.border, nodeData.color === opt.value && "ring-1 ring-primary scale-110")}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── DIAMOND (Conditional) NODE ──
  if (shape === "diamond") {
    return (
      <div ref={nodeRef} className="group relative" style={{ width: 150, height: 150 }} onDoubleClick={startEditing}>
        {handles}
        <div
          className={cn(
            "absolute inset-[8px] border-2 transition-all duration-200 pointer-events-none",
            colorOpt.bg, colorOpt.border,
            selected ? `ring-2 ring-primary shadow-lg ${colorOpt.glow}` : "shadow-md",
          )}
          style={{ transform: "rotate(45deg)", borderRadius: "14px" }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 z-10 pointer-events-none">
          {iconEntry && (
            <div className={cn("p-1.5 rounded-lg mb-1.5 pointer-events-auto", colorOpt.bg)}>
              <iconEntry.Icon className={cn("h-5 w-5", colorOpt.text)} />
            </div>
          )}
          {editing
            ? <div className="pointer-events-auto w-full">{labelInput("text-center border-b-2")}</div>
            : <span className="text-xs font-bold text-foreground leading-tight pointer-events-auto">{nodeData.label}</span>}
          {editing && (
            <div className="pointer-events-auto w-full mt-1">
              {descTextarea("text-[10px]", 2)}
            </div>
          )}
          {nodeData.description && !editing && (
            <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2 leading-tight pointer-events-auto">{nodeData.description}</p>
          )}
        </div>
        {selected && (
          <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 flex gap-1.5 z-20 pointer-events-auto">
            <button onClick={() => setShowSettings(!showSettings)} className="text-[9px] text-muted-foreground hover:text-foreground bg-card border rounded-md px-2 py-0.5 shadow-sm transition-colors">⚙</button>
            <button onClick={() => nodeData.onDuplicate?.(id)} className="text-[9px] text-muted-foreground hover:text-foreground bg-card border rounded-md px-2 py-0.5 shadow-sm transition-colors">
              <Copy className="h-3 w-3 inline" />
            </button>
          </div>
        )}
        {showSettings && selected && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-12 w-60 bg-card border rounded-xl shadow-xl p-3 space-y-3 z-30 pointer-events-auto">
            <SettingsPanel nodeData={nodeData} updateField={updateField} iconSearch={iconSearch} setIconSearch={setIconSearch} />
          </div>
        )}
      </div>
    );
  }

  // ── STANDARD NODE (rectangle / rounded) ──
  const shapeClass = shape === "rounded" ? "rounded-2xl" : "rounded-xl";

  return (
    <div
      ref={nodeRef}
      className={cn(
        "group relative min-w-[160px] max-w-[250px] border-2 transition-all duration-200 px-4 py-3",
        colorOpt.bg, colorOpt.border, shapeClass,
        selected
          ? `ring-2 ring-primary ring-offset-1 ring-offset-background shadow-lg ${colorOpt.glow}`
          : "shadow-md hover:shadow-lg",
      )}
      onDoubleClick={startEditing}
    >
      {handles}

      {/* Icon + Title */}
      <div className="flex items-center gap-2.5 mb-1">
        {iconEntry && (
          <div className={cn("p-1 rounded-md flex-shrink-0", colorOpt.value !== "default" ? colorOpt.bg : "bg-muted")}>
            <iconEntry.Icon className={cn("h-4 w-4", colorOpt.text)} />
          </div>
        )}
        {editing
          ? labelInput("text-sm border-b-2")
          : <span className="text-sm font-bold text-foreground truncate">{nodeData.label}</span>}
      </div>

      {/* Description */}
      {nodeData.description && !editing && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{nodeData.description}</p>
      )}
      {editing && <div className="mt-1.5">{descTextarea("", 2)}</div>}

      {/* Actions row */}
      {selected && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
          <button onClick={() => setShowSettings(!showSettings)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" aria-label={showSettings ? "Zatvori podešavanja" : "Otvori podešavanja"}>
            ⚙ {showSettings ? "Zatvori" : "Podešavanja"}
          </button>
          <button onClick={() => nodeData.onDuplicate?.(id)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" aria-label="Dupliraj čvor">
            <Copy className="h-3 w-3" /> Dupliraj
          </button>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && selected && (
        <div className="mt-2 space-y-3 border-t border-border pt-3">
          <SettingsPanel nodeData={nodeData} updateField={updateField} iconSearch={iconSearch} setIconSearch={setIconSearch} />
        </div>
      )}
    </div>
  );
}

export default memo(MindMapNodeComponent);
