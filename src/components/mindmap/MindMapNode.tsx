import { memo, useState, useCallback } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { default as Scale } from "lucide-react/dist/esm/icons/scale";
import { default as FileText } from "lucide-react/dist/esm/icons/file-text";
import { default as Building2 } from "lucide-react/dist/esm/icons/building-2";
import { default as Calendar } from "lucide-react/dist/esm/icons/calendar";
import { default as OctagonX } from "lucide-react/dist/esm/icons/octagon-x";
import { default as RefreshCw } from "lucide-react/dist/esm/icons/refresh-cw";
import { default as User } from "lucide-react/dist/esm/icons/user";
import { default as Coins } from "lucide-react/dist/esm/icons/coins";
import { default as ArrowRight } from "lucide-react/dist/esm/icons/arrow-right";
import { default as CheckCircle2 } from "lucide-react/dist/esm/icons/check-circle-2";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { default as HelpCircle } from "lucide-react/dist/esm/icons/help-circle";
import { default as Clock } from "lucide-react/dist/esm/icons/clock";
import { default as Gavel } from "lucide-react/dist/esm/icons/gavel";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as ShieldCheck } from "lucide-react/dist/esm/icons/shield-check";
import { default as Send } from "lucide-react/dist/esm/icons/send";
import { default as Search } from "lucide-react/dist/esm/icons/search";
import { default as Copy } from "lucide-react/dist/esm/icons/copy";

// ── Icon Registry with Lucide components ──
export const ICON_REGISTRY: { value: string; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { value: "scale", label: "Sud/Pravda", Icon: Scale },
  { value: "file-text", label: "Podnesak/Akt", Icon: FileText },
  { value: "building", label: "Organ/Vlast", Icon: Building2 },
  { value: "calendar", label: "Rok/Datum", Icon: Calendar },
  { value: "octagon-x", label: "Prekid/Kraj", Icon: OctagonX },
  { value: "refresh", label: "Žalba/Ponavljanje", Icon: RefreshCw },
  { value: "user", label: "Stranka/Zastupnik", Icon: User },
  { value: "coins", label: "Troškovi", Icon: Coins },
  { value: "arrow-right", label: "Korak", Icon: ArrowRight },
  { value: "check", label: "Završeno", Icon: CheckCircle2 },
  { value: "alert", label: "Upozorenje", Icon: AlertTriangle },
  { value: "question", label: "Odluka", Icon: HelpCircle },
  { value: "clock", label: "Vrijeme", Icon: Clock },
  { value: "gavel", label: "Presuda", Icon: Gavel },
  { value: "book", label: "Zakon/Propis", Icon: BookOpen },
  { value: "shield", label: "Zaštita", Icon: ShieldCheck },
  { value: "send", label: "Dostava", Icon: Send },
];

const COLOR_OPTIONS = [
  { value: "default", bg: "bg-card", border: "border-border", text: "text-foreground" },
  { value: "blue", bg: "bg-blue-500/15", border: "border-blue-500/40", text: "text-blue-700 dark:text-blue-300" },
  { value: "green", bg: "bg-green-500/15", border: "border-green-500/40", text: "text-green-700 dark:text-green-300" },
  { value: "amber", bg: "bg-amber-500/15", border: "border-amber-500/40", text: "text-amber-700 dark:text-amber-300" },
  { value: "red", bg: "bg-red-500/15", border: "border-red-500/40", text: "text-red-700 dark:text-red-300" },
  { value: "purple", bg: "bg-purple-500/15", border: "border-purple-500/40", text: "text-purple-700 dark:text-purple-300" },
];

export type NodeShape = "rectangle" | "rounded" | "diamond" | "group";

export type MindMapNodeData = {
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  shape?: NodeShape;
  onUpdate?: (id: string, data: Partial<MindMapNodeData>) => void;
  onDuplicate?: (id: string) => void;
};

const handleBase = "!w-3 !h-3 !min-w-[12px] !min-h-[12px] !border-2 !border-background !rounded-full !bg-primary opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:!scale-125 transition-all";

function MindMapNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData;
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [iconSearch, setIconSearch] = useState("");

  const colorOpt = COLOR_OPTIONS.find(c => c.value === (nodeData.color || "default")) || COLOR_OPTIONS[0];
  const shape = (nodeData.shape || "rectangle") as NodeShape;
  const iconEntry = ICON_REGISTRY.find(i => i.value === (nodeData.icon || "file-text"));

  const updateField = useCallback((field: string, value: string) => {
    nodeData.onUpdate?.(id, { [field]: value });
  }, [id, nodeData.onUpdate]);

  const filteredIcons = iconSearch
    ? ICON_REGISTRY.filter(i => i.label.toLowerCase().includes(iconSearch.toLowerCase()) || i.value.includes(iconSearch.toLowerCase()))
    : ICON_REGISTRY;

  // ── GROUP NODE ──
  if (shape === "group") {
    return (
      <div
        className={cn(
          "group relative border-2 border-dashed rounded-xl transition-all",
          colorOpt.border,
          selected && "ring-2 ring-primary",
        )}
        style={{ minWidth: 250, minHeight: 150, background: "hsl(var(--muted) / 0.3)" }}
        onDoubleClick={() => setEditing(true)}
      >
        <NodeResizer
          minWidth={200}
          minHeight={120}
          isVisible={!!selected}
          lineClassName="!border-primary"
          handleClassName="!w-2 !h-2 !bg-primary !border-background !rounded-sm"
        />
        <Handle type="source" position={Position.Top} id="top" className={handleBase} style={{ top: -6 }} />
        <Handle type="source" position={Position.Right} id="right" className={handleBase} style={{ right: -6 }} />
        <Handle type="source" position={Position.Bottom} id="bottom" className={handleBase} style={{ bottom: -6 }} />
        <Handle type="source" position={Position.Left} id="left" className={handleBase} style={{ left: -6 }} />

        <div className="px-3 py-1.5 border-b border-dashed border-inherit bg-muted/50 rounded-t-xl">
          {editing ? (
            <input
              autoFocus
              className="bg-transparent border-b border-primary text-xs font-semibold w-full outline-none text-foreground uppercase tracking-wider"
              defaultValue={nodeData.label}
              onBlur={(e) => { updateField("label", e.target.value); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{nodeData.label}</span>
          )}
        </div>

        {selected && (
          <div className="absolute bottom-1 right-2 flex gap-1.5">
            {COLOR_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => updateField("color", opt.value)}
                className={cn("w-3.5 h-3.5 rounded-full border", opt.bg, opt.border, nodeData.color === opt.value && "ring-1 ring-primary")}
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
      <div className="group relative" style={{ width: 160, height: 160 }} onDoubleClick={() => setEditing(true)}>
        <Handle type="source" position={Position.Top} id="top" className={handleBase} style={{ top: 0, left: "50%", transform: "translateX(-50%)" }} />
        <Handle type="source" position={Position.Right} id="right" className={handleBase} style={{ right: 0, top: "50%", transform: "translateY(-50%)" }} />
        <Handle type="source" position={Position.Bottom} id="bottom" className={handleBase} style={{ bottom: 0, left: "50%", transform: "translateX(-50%)" }} />
        <Handle type="source" position={Position.Left} id="left" className={handleBase} style={{ left: 0, top: "50%", transform: "translateY(-50%)" }} />

        <div
          className={cn(
            "absolute inset-0 border-2 shadow-md transition-all",
            colorOpt.bg, colorOpt.border,
            selected && "ring-2 ring-primary shadow-lg",
          )}
          style={{ transform: "rotate(45deg)", borderRadius: "12px" }}
        />

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
          {iconEntry && <iconEntry.Icon className={cn("h-5 w-5 mb-1", colorOpt.text)} />}
          {editing ? (
            <input
              autoFocus
              className="bg-transparent border-b border-primary text-xs font-semibold w-full outline-none text-foreground text-center"
              defaultValue={nodeData.label}
              onBlur={(e) => { updateField("label", e.target.value); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <span className="text-xs font-semibold text-foreground leading-tight">{nodeData.label}</span>
          )}
        </div>

        {selected && (
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
            <button onClick={() => setShowSettings(!showSettings)} className="text-[9px] text-muted-foreground hover:text-foreground bg-card border rounded px-1.5 py-0.5">⚙</button>
            <button onClick={() => nodeData.onDuplicate?.(id)} className="text-[9px] text-muted-foreground hover:text-foreground bg-card border rounded px-1.5 py-0.5">📋</button>
          </div>
        )}

        {showSettings && selected && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-10 w-56 bg-card border rounded-lg shadow-lg p-3 space-y-2 z-30">
            <SettingsPanel nodeData={nodeData} updateField={updateField} iconSearch={iconSearch} setIconSearch={setIconSearch} filteredIcons={filteredIcons} />
          </div>
        )}
      </div>
    );
  }

  // ── STANDARD NODE (rectangle / rounded) ──
  const shapeClass = shape === "rounded" ? "rounded-2xl" : "rounded-lg";

  return (
    <div
      className={cn(
        "group relative min-w-[150px] max-w-[240px] border-2 shadow-md transition-all px-4 py-3",
        colorOpt.bg, colorOpt.border, shapeClass,
        selected && "ring-2 ring-primary shadow-lg",
      )}
      onDoubleClick={() => setEditing(true)}
    >
      <Handle type="source" position={Position.Top} id="top" className={handleBase} style={{ top: -6 }} />
      <Handle type="source" position={Position.Right} id="right" className={handleBase} style={{ right: -6 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleBase} style={{ bottom: -6 }} />
      <Handle type="source" position={Position.Left} id="left" className={handleBase} style={{ left: -6 }} />

      {/* Icon + Title */}
      <div className="flex items-center gap-2 mb-1">
        {iconEntry && <iconEntry.Icon className={cn("h-4 w-4 flex-shrink-0", colorOpt.text)} />}
        {editing ? (
          <input
            autoFocus
            className="bg-transparent border-b border-primary text-sm font-semibold w-full outline-none text-foreground"
            defaultValue={nodeData.label}
            onBlur={(e) => { updateField("label", e.target.value); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
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

      {/* Actions row */}
      {selected && (
        <div className="flex items-center gap-2 mt-1.5">
          <button onClick={() => setShowSettings(!showSettings)} className="text-[10px] text-muted-foreground hover:text-foreground underline">
            {showSettings ? "Zatvori" : "⚙ Podešavanja"}
          </button>
          <button onClick={() => nodeData.onDuplicate?.(id)} className="text-[10px] text-muted-foreground hover:text-foreground underline">
            <Copy className="h-3 w-3 inline mr-0.5" /> Dupliraj
          </button>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && selected && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <SettingsPanel nodeData={nodeData} updateField={updateField} iconSearch={iconSearch} setIconSearch={setIconSearch} filteredIcons={filteredIcons} />
        </div>
      )}
    </div>
  );
}

// ── Shared Settings Panel ──
function SettingsPanel({ nodeData, updateField, iconSearch, setIconSearch, filteredIcons }: {
  nodeData: MindMapNodeData;
  updateField: (field: string, value: string) => void;
  iconSearch: string;
  setIconSearch: (s: string) => void;
  filteredIcons: typeof ICON_REGISTRY;
}) {
  return (
    <>
      {/* Icon picker with search */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Ikonica</span>
        <div className="flex items-center gap-1 mt-1 mb-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            value={iconSearch}
            onChange={e => setIconSearch(e.target.value)}
            className="bg-transparent border-b border-border text-[10px] w-full outline-none text-foreground placeholder:text-muted-foreground"
            placeholder="Pretraži ikonice..."
          />
        </div>
        <div className="flex gap-1 flex-wrap max-h-24 overflow-y-auto">
          {filteredIcons.map(opt => (
            <button
              key={opt.value}
              onClick={() => updateField("icon", opt.value)}
              className={cn(
                "p-1.5 rounded hover:bg-muted transition-colors",
                nodeData.icon === opt.value && "ring-1 ring-primary bg-muted"
              )}
              title={opt.label}
            >
              <opt.Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Color picker */}
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

      {/* Shape picker */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Oblik</span>
        <div className="flex gap-1.5 mt-1">
          <button onClick={() => updateField("shape", "rectangle")} className={cn("w-7 h-5 rounded border-2 border-border", nodeData.shape === "rectangle" && "ring-1 ring-primary")} title="Pravougaonik" />
          <button onClick={() => updateField("shape", "rounded")} className={cn("w-7 h-5 rounded-full border-2 border-border", nodeData.shape === "rounded" && "ring-1 ring-primary")} title="Zaobljeno" />
          <button onClick={() => updateField("shape", "diamond")} className={cn("w-5 h-5 border-2 border-border rotate-45 rounded-sm", nodeData.shape === "diamond" && "ring-1 ring-primary")} title="Uslovni (dijamant)" />
        </div>
      </div>
    </>
  );
}

export default memo(MindMapNodeComponent);
