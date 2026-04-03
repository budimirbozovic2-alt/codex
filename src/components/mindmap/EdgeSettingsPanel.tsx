import { Palette, Trash2 } from "lucide-react";
import { type Edge, MarkerType } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { EDGE_STYLES, EDGE_COLORS, EDGE_TYPES } from "./mindmap-constants";

interface Props {
  edge: Edge;
  onUpdate: (edgeId: string, updates: Partial<Edge>) => void;
  onDelete: (edgeId: string) => void;
  onClose: () => void;
}

export default function EdgeSettingsPanel({ edge, onUpdate, onDelete, onClose }: Props) {
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
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xs" aria-label="Zatvori">✕</button>
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
                markerStart: { type: MarkerType.ArrowClosed, color: c.css, width: 20, height: 20 },
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
