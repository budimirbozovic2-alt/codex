import { Scale, FileText, Building2, Calendar, OctagonX, RefreshCw, User, Coins, ArrowRight, CheckCircle2, AlertTriangle, HelpCircle, Clock, Gavel, BookOpen, ShieldCheck, Send, Search, Copy, Sparkles } from "lucide-react";
import { memo, useState, useCallback, useRef } from "react";
import { Handle, Position, NodeProps, NodeResizer } from "@xyflow/react";
import { cn } from "@/lib/utils";
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
  { value: "sparkles", label: "Posebno", Icon: Sparkles },
];

const COLOR_OPTIONS = [
  { value: "default", bg: "bg-card", border: "border-border", text: "text-foreground", glow: "" },
  { value: "blue", bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-600 dark:text-blue-400", glow: "shadow-blue-500/20" },
  { value: "green", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-600 dark:text-emerald-400", glow: "shadow-emerald-500/20" },
  { value: "amber", bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-600 dark:text-amber-400", glow: "shadow-amber-500/20" },
  { value: "red", bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-600 dark:text-red-400", glow: "shadow-red-500/20" },
  { value: "purple", bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-600 dark:text-purple-400", glow: "shadow-purple-500/20" },
  { value: "cyan", bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-600 dark:text-cyan-400", glow: "shadow-cyan-500/20" },
  { value: "pink", bg: "bg-pink-500/10", border: "border-pink-500/30", text: "text-pink-600 dark:text-pink-400", glow: "shadow-pink-500/20" },
];

export { COLOR_OPTIONS };

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

const handleBase =
  "!w-3 !h-3 !min-w-[12px] !min-h-[12px] !border-2 !border-background !rounded-full !bg-primary opacity-0 group-hover:opacity-100 hover:!opacity-100 hover:!scale-125 transition-all duration-200 z-20";

function MindMapNodeComponent({ id, data, selected }: NodeProps) {
  const nodeData = data as unknown as MindMapNodeData;
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback((e: React.FocusEvent, field: string, value: string) => {
    updateField(field, value);
    if (nodeRef.current?.contains(e.relatedTarget as Node)) return;
    setEditing(false);
  }, []);

  const colorOpt = COLOR_OPTIONS.find(c => c.value === (nodeData.color || "default")) || COLOR_OPTIONS[0];
  const shape = (nodeData.shape || "rectangle") as NodeShape;
  const iconEntry = ICON_REGISTRY.find(i => i.value === (nodeData.icon || "file-text"));

  const updateField = useCallback((field: string, value: string) => {
    nodeData.onUpdate?.(id, { [field]: value });
  }, [id, nodeData.onUpdate]);

  const filteredIcons = iconSearch
    ? ICON_REGISTRY.filter(i => i.label.toLowerCase().includes(iconSearch.toLowerCase()) || i.value.includes(iconSearch.toLowerCase()))
    : ICON_REGISTRY;

  const handles = (
    <>
      <Handle type="target" position={Position.Top} id="top" className={handleBase} style={{ top: -6 }} />
      <Handle type="source" position={Position.Right} id="right" className={handleBase} style={{ right: -6 }} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={handleBase} style={{ bottom: -6 }} />
      <Handle type="target" position={Position.Left} id="left" className={handleBase} style={{ left: -6 }} />
    </>
  );

  // ── GROUP NODE ──
  if (shape === "group") {
    return (
      <div
        className={cn(
          "group relative border-2 border-dashed rounded-xl transition-all duration-200",
          colorOpt.border,
          selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        )}
        style={{ minWidth: 250, minHeight: 150, background: "hsl(var(--muted) / 0.25)" }}
        onDoubleClick={() => setEditing(true)}
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
          {editing ? (
            <input
              autoFocus
              className="bg-transparent border-b border-primary text-xs font-bold w-full outline-none text-foreground uppercase tracking-wider nodrag nowheel nopan"
              defaultValue={nodeData.label}
              onBlur={(e) => { updateField("label", e.target.value); setEditing(false); }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{nodeData.label}</span>
          )}
        </div>
        {selected && (
          <div className="absolute bottom-1.5 right-2 flex gap-1.5">
            {COLOR_OPTIONS.map(opt => (
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
      <div className="group relative" style={{ width: 150, height: 150 }} onDoubleClick={() => setEditing(true)}>
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
          {editing ? (
            <input
              autoFocus
              className="bg-transparent border-b border-primary text-xs font-bold w-full outline-none text-foreground text-center pointer-events-auto nodrag nowheel nopan"
              defaultValue={nodeData.label}
              onBlur={(e) => { updateField("label", e.target.value); setEditing(false); }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <span className="text-xs font-bold text-foreground leading-tight pointer-events-auto">{nodeData.label}</span>
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
            <SettingsPanel nodeData={nodeData} updateField={updateField} iconSearch={iconSearch} setIconSearch={setIconSearch} filteredIcons={filteredIcons} />
          </div>
        )}
      </div>
    );
  }

  // ── STANDARD NODE (rectangle / rounded) ──
  const shapeClass = shape === "rounded" ? "rounded-2xl" : "rounded-xl";

  return (
    <div
      className={cn(
        "group relative min-w-[160px] max-w-[250px] border-2 transition-all duration-200 px-4 py-3",
        colorOpt.bg, colorOpt.border, shapeClass,
        selected
          ? `ring-2 ring-primary ring-offset-1 ring-offset-background shadow-lg ${colorOpt.glow}`
          : "shadow-md hover:shadow-lg",
      )}
      onDoubleClick={() => setEditing(true)}
    >
      {handles}

      {/* Icon + Title */}
      <div className="flex items-center gap-2.5 mb-1">
        {iconEntry && (
          <div className={cn("p-1 rounded-md flex-shrink-0", colorOpt.value !== "default" ? colorOpt.bg : "bg-muted")}>
            <iconEntry.Icon className={cn("h-4 w-4", colorOpt.text)} />
          </div>
        )}
        {editing ? (
          <input
            autoFocus
            className="bg-transparent border-b-2 border-primary text-sm font-bold w-full outline-none text-foreground nodrag nowheel nopan"
            defaultValue={nodeData.label}
            onBlur={(e) => { updateField("label", e.target.value); setEditing(false); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        ) : (
          <span className="text-sm font-bold text-foreground truncate">{nodeData.label}</span>
        )}
      </div>

      {/* Description */}
      {nodeData.description && !editing && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{nodeData.description}</p>
      )}
      {editing && (
        <textarea
          className="bg-transparent border border-border rounded-lg text-xs w-full outline-none text-foreground mt-1.5 p-1.5 resize-none focus:ring-1 focus:ring-primary nodrag nowheel nopan"
          rows={2}
          defaultValue={nodeData.description || ""}
          placeholder="Opis..."
          onKeyDown={(e) => e.stopPropagation()}
          onBlur={(e) => updateField("description", e.target.value)}
        />
      )}

      {/* Actions row */}
      {selected && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
          <button onClick={() => setShowSettings(!showSettings)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            ⚙ {showSettings ? "Zatvori" : "Podešavanja"}
          </button>
          <button onClick={() => nodeData.onDuplicate?.(id)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <Copy className="h-3 w-3" /> Dupliraj
          </button>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && selected && (
        <div className="mt-2 space-y-3 border-t border-border pt-3">
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
      {/* Icon picker */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Ikonica</span>
        <div className="flex items-center gap-1.5 mt-1.5 mb-1.5 bg-muted/50 rounded-md px-2 py-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            value={iconSearch}
            onChange={e => setIconSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="bg-transparent text-[11px] w-full outline-none text-foreground placeholder:text-muted-foreground"
            placeholder="Pretraži..."
          />
        </div>
        <div className="flex gap-1 flex-wrap max-h-24 overflow-y-auto">
          {filteredIcons.map(opt => (
            <button
              key={opt.value}
              onClick={() => updateField("icon", opt.value)}
              className={cn(
                "p-1.5 rounded-md hover:bg-muted transition-all duration-150",
                nodeData.icon === opt.value && "ring-2 ring-primary bg-primary/10"
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
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Boja</span>
        <div className="flex gap-2 mt-1.5">
          {COLOR_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => updateField("color", opt.value)}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-all duration-150 hover:scale-110",
                opt.bg, opt.border,
                nodeData.color === opt.value && "ring-2 ring-primary scale-110"
              )}
            />
          ))}
        </div>
      </div>

      {/* Shape picker */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Oblik</span>
        <div className="flex gap-2 mt-1.5">
          {(["rectangle", "rounded", "diamond"] as const).map(s => (
            <button
              key={s}
              onClick={() => updateField("shape", s)}
              className={cn(
                "border-2 border-border transition-all duration-150 hover:border-primary",
                s === "rectangle" && "w-8 h-6 rounded-md",
                s === "rounded" && "w-8 h-6 rounded-full",
                s === "diamond" && "w-5 h-5 rotate-45 rounded-sm",
                nodeData.shape === s && "ring-2 ring-primary border-primary"
              )}
              title={s === "rectangle" ? "Pravougaonik" : s === "rounded" ? "Zaobljeno" : "Dijamant"}
            />
          ))}
        </div>
      </div>
    </>
  );
}

export default memo(MindMapNodeComponent);
