import { memo, useCallback, useState, type KeyboardEvent } from "react";
import { Tag, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeTag, TAG_LIMITS } from "@/lib/zettelkasten-tags";

interface Props {
  /** Already-normalized current tag list. */
  tags: string[];
  /** Receives a NEW normalized list. Caller is responsible for persistence. */
  onChange: (tags: string[]) => void;
}

/**
 * Compact horizontal tag editor used inside the article edit mode.
 *
 * Behavior:
 *  - Existing tags render as chips with an "×" remove button.
 *  - A trailing input accepts new tags; Enter or comma commits the input.
 *  - Duplicate normalized tags are silently ignored (no toast — the chip the
 *    user already sees IS the feedback).
 *  - When the per-article cap is reached the input becomes disabled with a
 *    descriptive placeholder; existing chips remain removable so the user can
 *    free up a slot.
 *
 * Memoized so that typing in the article body does not re-render the strip.
 */
function ZettelTagEditorImpl({ tags, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const atCap = tags.length >= TAG_LIMITS.maxPerArticle;

  const commit = useCallback((raw: string) => {
    const norm = normalizeTag(raw);
    if (!norm) return;
    if (tags.includes(norm)) {
      // Duplicate — no-op, just clear the input so the user moves on.
      setDraft("");
      return;
    }
    if (tags.length >= TAG_LIMITS.maxPerArticle) return;
    onChange([...tags, norm]);
    setDraft("");
  }, [tags, onChange]);

  const handleKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && tags.length > 0) {
      // UX nicety: empty backspace removes the last chip — common pattern
      // in Notion / Linear / GitHub label inputs.
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  }, [commit, draft, tags, onChange]);

  const removeTag = useCallback((tag: string) => {
    onChange(tags.filter(t => t !== tag));
  }, [tags, onChange]);

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 bg-card/30 px-2 py-1.5">
      <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {tags.map(t => (
        <span
          key={t}
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-sm bg-muted/60 text-foreground"
        >
          {t}
          <button
            type="button"
            onClick={() => removeTag(t)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Ukloni tag ${t}`}
            title={`Ukloni "${t}"`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1 flex-1 min-w-[120px]">
        <Plus className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => { if (draft.trim()) commit(draft); }}
          disabled={atCap}
          placeholder={
            atCap
              ? `Maks. ${TAG_LIMITS.maxPerArticle} tagova`
              : tags.length === 0
                ? "Dodaj tag (Enter)"
                : "Još jedan…"
          }
          className="h-6 border-0 px-1 py-0 text-[11px] focus-visible:ring-0 shadow-none bg-transparent"
        />
      </div>
    </div>
  );
}

export default memo(ZettelTagEditorImpl);
