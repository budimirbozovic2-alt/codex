import { Tag as TagIcon, X } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizeTag, TAG_LIMITS } from "@/lib/zettelkasten-tags";
import type { defaultEdit } from "@/lib/split-wizard-build";

type EditDraft = ReturnType<typeof defaultEdit>;

interface Props {
  edit: EditDraft;
  onUpdate: (patch: Partial<EditDraft>) => void;
}

/** Per-module tags chip-input. */
export function ModuleTags({ edit, onUpdate }: Props) {
  const [draft, setDraft] = useState("");
  const commit = useCallback(() => {
    const t = normalizeTag(draft);
    if (!t) { setDraft(""); return; }
    if (edit.tags.includes(t)) { setDraft(""); return; }
    if (edit.tags.length >= TAG_LIMITS.maxPerArticle) { setDraft(""); return; }
    onUpdate({ tags: [...edit.tags, t] });
    setDraft("");
  }, [draft, edit.tags, onUpdate]);

  const removeTag = useCallback(
    (t: string) => onUpdate({ tags: edit.tags.filter((x) => x !== t) }),
    [edit.tags, onUpdate],
  );

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <TagIcon className="h-3 w-3" />
        Tagovi (opcionalno) — {edit.tags.length}/{TAG_LIMITS.maxPerArticle}
      </label>
      <div
        className={cn(
          "min-h-[38px] flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-md border bg-background",
          edit.skipped && "opacity-50 pointer-events-none",
        )}
      >
        {edit.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[11px]">
            #{t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="hover:text-foreground"
              aria-label={`Ukloni tag ${t}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && draft === "" && edit.tags.length > 0) {
              removeTag(edit.tags[edit.tags.length - 1]);
            }
          }}
          onBlur={commit}
          disabled={edit.skipped || edit.tags.length >= TAG_LIMITS.maxPerArticle}
          placeholder={
            edit.tags.length >= TAG_LIMITS.maxPerArticle
              ? "Limit dosegnut"
              : "Dodaj tag (Enter)..."
          }
          className="flex-1 min-w-[100px] bg-transparent text-[12px] focus:outline-none"
        />
      </div>
    </div>
  );
}
