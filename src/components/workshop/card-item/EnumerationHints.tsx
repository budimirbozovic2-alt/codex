import { Type } from "lucide-react";

interface Props {
  items: string[];
}

export function EnumerationHints({ items }: Props) {
  if (items.length < 2) return null;
  return (
    <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-2">
      <p className="text-xs font-medium text-warning uppercase tracking-wider flex items-center gap-1.5">
        <Type className="h-3.5 w-3.5" /> Nabrajanje detektovano — akronim ({items.length} slova)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, idx) => {
          const firstLetter = item.trim()[0]?.toUpperCase() || "?";
          return (
            <div key={idx} className="flex items-center gap-1 px-2 py-1 rounded-md bg-background border text-xs">
              <span className="font-bold text-warning">{firstLetter}</span>
              <span className="text-muted-foreground truncate max-w-[120px]">{item}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Sugestija: <strong className="text-foreground">{items.map((i) => i.trim()[0]?.toUpperCase() || "").join("")}</strong>
      </p>
    </div>
  );
}
