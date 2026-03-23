import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

const ICON_OPTIONS = [
  { value: "scale", label: "Sud", emoji: "⚖️" },
  { value: "building", label: "Organ", emoji: "🏢" },
  { value: "document", label: "Odluka", emoji: "📄" },
  { value: "person", label: "Stranka", emoji: "👤" },
  { value: "clock", label: "Rok", emoji: "🕒" },
  { value: "arrow", label: "Korak", emoji: "➡️" },
  { value: "check", label: "Završeno", emoji: "✅" },
  { value: "warning", label: "Upozorenje", emoji: "⚠️" },
  { value: "question", label: "Odluka", emoji: "❓" },
];

const COLOR_OPTIONS = [
  { value: "default", bg: "bg-card", border: "border-border", handle: "!bg-muted-foreground" },
  { value: "blue", bg: "bg-blue-500/15", border: "border-blue-500/40", handle: "!bg-blue-500" },
  { value: "green", bg: "bg-green-500/15", border: "border-green-500/40", handle: "!bg-green-500" },
  { value: "amber", bg: "bg-amber-500/15", border: "border-amber-500/40", handle: "!bg-amber-500" },
  { value: "red", bg: "bg-red-500/15", border: "border-red-500/40", handle: "!bg-red-500" },
  { value: "purple", bg: "bg-purple-500/15", border: "border-purple-500/40", handle: "!bg-purple-500" },
];

const SHAPE_OPTIONS = [
  { value: "rectangle", className: "rounded-lg" },
  { value: "rounded", className: "rounded-2xl" },
  { value: "diamond", className: "rounded-lg rotate-0" },
];

export type MindMapNodeData = {
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  shape?: string;
  onUpdate?: (id: string, data: Partial<MindMapNodeData>) => void;
};

function MindMapNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData;
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const colorOpt = COLOR_OPTIONS.find(c => c.value === (nodeData.color || "default")) || COLOR_OPTIONS[0];
  const shapeOpt = SHAPE_OPTIONS.find(s => s.value === (nodeData.shape || "rectangle")) || SHAPE_OPTIONS[0];
  const iconObj = ICON_OPTIONS.find(i => i.value === (nodeData.icon || "document"));

  const updateField = (field: string, value: string) => {
    nodeData.onUpdate?.(id, { [field]: value });
  };

  const handleStyle = "!w-3 !h-3 !min-w-[12px] !min-h-[12px] !border-2 !border-background !rounded-full opacity-0 group-hover:opacity-100 transition-opacity " + (colorOpt.handle || "!bg-primary");

  return (
    <div
      className={cn(
        "group relative min-w-[150px] max-w-[240px] border-2 shadow-md transition-all",
        colorOpt.bg, colorOpt.border, shapeOpt.className,
        selected && "ring-2 ring-primary shadow-lg",
        "px-4 py-3"
      )}
      onDoubleClick={() => setEditing(true)}
    >
      {/* 4-side handles for easy connections */}
      <Handle type="target" position={Position.Top} id="top" className={handleStyle} style={{ top: -6 }} />
      <Handle type="target" position={Position.Left} id="left" className={handleStyle} style={{ left: -6 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleStyle} style={{ bottom: -6 }} />
      <Handle type="source" position={Position.Right} id="right" className={handleStyle} style={{ right: -6 }} />
      {/* Also allow reverse — source on top/left and target on bottom/right */}
      <Handle type="source" position={Position.Top} id="top-source" className={handleStyle} style={{ top: -6 }} />
      <Handle type="source" position={Position.Left} id="left-source" className={handleStyle} style={{ left: -6 }} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" className={handleStyle} style={{ bottom: -6 }} />
      <Handle type="target" position={Position.Right} id="right-target" className={handleStyle} style={{ right: -6 }} />

      {/* Icon + Title */}
      <div className="flex items-center gap-2 mb-1">
        {iconObj && <span className="text-lg select-none">{iconObj.emoji}</span>}
        {editing ? (
          <input
            autoFocus
            className="bg-transparent border-b border-primary text-sm font-semibold w-full outline-none text-foreground"
            defaultValue={nodeData.label}
            onBlur={(e) => {
              updateField("label", e.target.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
          />
        ) : (
          <span className="text-sm font-semibold text-foreground truncate">{nodeData.label}</span>
        )}
      </div>

      {/* Description */}
      {nodeData.description && !editing && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{nodeData.description}</p>
      )}
      {editing && (
        <textarea
          className="bg-transparent border border-border rounded text-xs w-full outline-none text-foreground mt-1 p-1 resize-none"
          rows={2}
          defaultValue={nodeData.description || ""}
          placeholder="Opis..."
          onBlur={(e) => updateField("description", e.target.value)}
        />
      )}

      {/* Settings toggle */}
      {selected && (
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-[10px] text-muted-foreground hover:text-foreground mt-1.5 underline"
        >
          {showSettings ? "Zatvori" : "⚙ Podešavanja"}
        </button>
      )}

      {/* Settings panel */}
      {showSettings && selected && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Ikonica</span>
            <div className="flex gap-1 mt-1 flex-wrap">
              {ICON_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateField("icon", opt.value)}
                  className={cn(
                    "text-base p-1 rounded hover:bg-muted",
                    nodeData.icon === opt.value && "ring-1 ring-primary bg-muted"
                  )}
                  title={opt.label}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Boja</span>
            <div className="flex gap-1.5 mt-1">
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateField("color", opt.value)}
                  className={cn(
                    "w-5 h-5 rounded-full border-2",
                    opt.bg, opt.border,
                    nodeData.color === opt.value && "ring-2 ring-primary"
                  )}
                />
              ))}
            </div>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Oblik</span>
            <div className="flex gap-1.5 mt-1">
              <button onClick={() => updateField("shape", "rectangle")} className={cn("w-7 h-5 rounded border-2 border-border", nodeData.shape !== "rounded" && nodeData.shape !== "diamond" && "ring-1 ring-primary")} title="Pravougaonik" />
              <button onClick={() => updateField("shape", "rounded")} className={cn("w-7 h-5 rounded-full border-2 border-border", nodeData.shape === "rounded" && "ring-1 ring-primary")} title="Zaobljeno" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(MindMapNodeComponent);
