import { Plus, Tag, X } from "lucide-react";
import { useState } from "react";

interface Props {
  tags: readonly string[];
  onChange: (tags: string[]) => void;
}

export function TagsEditor({ tags, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const list = tags ?? [];

  const commit = () => {
    const v = draft.trim();
    if (!v) return;
    if (!list.includes(v)) onChange([...list, v]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Tag className="h-3 w-3" /> Oznake
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((tag) => (
          <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs font-medium">
            {tag}
            <button
              onClick={() => onChange(list.filter((t) => t !== tag))}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="Novi tag..."
            className="w-24 px-2 py-0.5 rounded-md border bg-background text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            onClick={commit}
            className="p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
