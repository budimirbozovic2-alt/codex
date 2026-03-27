import { Trash2, Pencil, GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { StudyPhase } from "@/lib/planner-storage";
import { cn } from "@/lib/utils";
import { PHASE_COLORS } from "./planner-constants";

export interface PhaseItemProps {
  phase: StudyPhase & { total: number; learned: number; pct: number; remainingCards: number };
  index: number;
  dynamicDays: number | null;
  isEditing: boolean;
  editName: string;
  editDays: string;
  setEditName: (v: string) => void;
  setEditDays: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onRemove: () => void;
  onOpenInDB: () => void;
}

export default function PhaseItem({ phase: p, index: i, dynamicDays, isEditing, editName, editDays, setEditName, setEditDays, onSaveEdit, onCancelEdit, onStartEdit, onRemove, onOpenInDB }: PhaseItemProps) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={p}
      dragListener={false}
      dragControls={controls}
      className="p-3 rounded-lg border bg-secondary/30 space-y-2"
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 25px -5px rgba(0,0,0,0.15)", zIndex: 50 }}
    >
      {isEditing ? (
        <div className="flex items-center gap-2">
          <Input value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 h-8 text-sm" />
          <Input type="number" value={editDays} onChange={e => setEditDays(e.target.value)} className="w-20 h-8 text-sm" min={1} placeholder="Dana" />
          <Button size="sm" variant="outline" className="h-8" onClick={onSaveEdit}>Sačuvaj</Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={onCancelEdit}>Otkaži</Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onPointerDown={(e) => controls.start(e)}
            className="cursor-grab active:cursor-grabbing touch-none p-0.5 text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PHASE_COLORS[i % PHASE_COLORS.length] }} />
          <div className="flex-1 min-w-0">
            <button
              onClick={p.categories.length > 0 ? onOpenInDB : undefined}
              className={cn(
                "text-sm font-medium truncate text-left",
                p.categories.length > 0 && "hover:text-primary hover:underline cursor-pointer transition-colors"
              )}
              title={p.categories.length > 0 ? "Otvori u Bazi podataka" : undefined}
            >
              {p.name}
            </button>
            <p className="text-xs text-muted-foreground">
              {p.expectedDays}d očekivano
              {dynamicDays !== null && dynamicDays !== p.expectedDays && (
                <span className={cn("ml-1", dynamicDays > p.expectedDays ? "text-warning" : "text-success")}>
                  → {dynamicDays}d dinamički
                </span>
              )}
              {p.categories.length > 0 && (
                <span className="ml-1">
                  •{" "}
                  {p.categories.map((cat, ci) => (
                    <span key={cat}>
                      {ci > 0 && ", "}
                      <button
                        onClick={onOpenInDB}
                        className="hover:text-primary hover:underline cursor-pointer transition-colors"
                      >
                        {cat}
                      </button>
                    </span>
                  ))}
                </span>
              )}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onStartEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Progress value={p.pct} className="h-2 flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">{p.learned}/{p.total} ({p.pct}%)</span>
      </div>
    </Reorder.Item>
  );
}
