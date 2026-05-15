import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_OPTIONS, ICON_REGISTRY, type MindMapNodeData } from "./icon-registry";

interface Props {
  nodeData: MindMapNodeData;
  updateField: (field: string, value: string) => void;
  iconSearch: string;
  setIconSearch: (s: string) => void;
}

/** Shared icon/color/shape picker — used by both diamond and standard nodes. */
export function SettingsPanel({ nodeData, updateField, iconSearch, setIconSearch }: Props) {
  const filteredIcons = iconSearch
    ? ICON_REGISTRY.filter(
        (i) =>
          i.label.toLowerCase().includes(iconSearch.toLowerCase()) ||
          i.value.includes(iconSearch.toLowerCase()),
      )
    : ICON_REGISTRY;

  return (
    <>
      {/* Icon picker */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Ikonica</span>
        <div className="flex items-center gap-1.5 mt-1.5 mb-1.5 bg-muted/50 rounded-md px-2 py-1">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input
            value={iconSearch}
            onChange={(e) => setIconSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            className="bg-transparent text-[11px] w-full outline-none text-foreground placeholder:text-muted-foreground"
            placeholder="Pretraži..."
          />
        </div>
        <div className="flex gap-1 flex-wrap max-h-24 overflow-y-auto">
          {filteredIcons.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateField("icon", opt.value)}
              className={cn(
                "p-1.5 rounded-md hover:bg-muted transition-all duration-150",
                nodeData.icon === opt.value && "ring-2 ring-primary bg-primary/10",
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
          {COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateField("color", opt.value)}
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-all duration-150 hover:scale-110",
                opt.bg, opt.border,
                nodeData.color === opt.value && "ring-2 ring-primary scale-110",
              )}
            />
          ))}
        </div>
      </div>

      {/* Shape picker */}
      <div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Oblik</span>
        <div className="flex gap-2 mt-1.5">
          {(["rectangle", "rounded", "diamond"] as const).map((s) => (
            <button
              key={s}
              onClick={() => updateField("shape", s)}
              className={cn(
                "border-2 border-border transition-all duration-150 hover:border-primary",
                s === "rectangle" && "w-8 h-6 rounded-md",
                s === "rounded" && "w-8 h-6 rounded-full",
                s === "diamond" && "w-5 h-5 rotate-45 rounded-sm",
                nodeData.shape === s && "ring-2 ring-primary border-primary",
              )}
              title={s === "rectangle" ? "Pravougaonik" : s === "rounded" ? "Zaobljeno" : "Dijamant"}
            />
          ))}
        </div>
      </div>
    </>
  );
}
