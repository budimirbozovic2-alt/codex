import { memo, useCallback, useState, type KeyboardEvent } from "react";
import { Languages, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { normalizeAlias, ALIAS_LIMITS } from "@/lib/zettelkasten-aliases";

interface Props {
  /** Already-normalized current alias list. */
  aliases: string[];
  /** Receives a NEW normalized list. Caller is responsible for persistence. */
  onChange: (aliases: string[]) => void;
}

/**
 * Compact horizontal alias editor used inside the article edit mode.
 *
 * Aliases are case-form synonyms (e.g. "krivičnog djela" for the article
 * "Krivično djelo"). Behaviour mirrors `ZettelTagEditor`:
 *   - Existing aliases render as chips with an "×" remove button.
 *   - A trailing input accepts new entries; Enter or comma commits.
 *   - Duplicates are silently dropped (the chip the user already sees IS
 *     the feedback).
 *   - At cap, the input becomes disabled with a descriptive placeholder.
 */
function ZettelAliasEditorImpl({ aliases, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const atCap = aliases.length >= ALIAS_LIMITS.maxPerArticle;

  const commit = useCallback((raw: string) => {
    const norm = normalizeAlias(raw);
    if (!norm) {
      setDraft("");
      return;
    }
    if (aliases.includes(norm)) {
      setDraft("");
      return;
    }
    if (aliases.length >= ALIAS_LIMITS.maxPerArticle) return;
    onChange([...aliases, norm]);
    setDraft("");
  }, [aliases, onChange]);

  const handleKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Backspace" && draft === "" && aliases.length > 0) {
      e.preventDefault();
      onChange(aliases.slice(0, -1));
    }
  }, [commit, draft, aliases, onChange]);

  const removeAlias = useCallback((alias: string) => {
    onChange(aliases.filter(a => a !== alias));
  }, [aliases, onChange]);

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 bg-card/30 px-2 py-1.5"
      title="Sinonimi i padeži za auto-povezivanje (npr. „krivičnog djela“ za članak „Krivično djelo“)"
    >
      <Languages className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {aliases.map(a => (
        <span
          key={a}
          className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-sm bg-muted/60 text-foreground"
        >
          {a}
          <button
            type="button"
            onClick={() => removeAlias(a)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label={`Ukloni alias ${a}`}
            title={`Ukloni "${a}"`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <div className="flex items-center gap-1 flex-1 min-w-[140px]">
        <Plus className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => { if (draft.trim()) commit(draft); }}
          disabled={atCap}
          placeholder={
            atCap
              ? `Maks. ${ALIAS_LIMITS.maxPerArticle} aliasa`
              : aliases.length === 0
                ? "Dodaj padež/sinonim (Enter)"
                : "Još jedan…"
          }
          className="h-6 border-0 px-1 py-0 text-[11px] focus-visible:ring-0 shadow-none bg-transparent"
        />
      </div>
    </div>
  );
}

export default memo(ZettelAliasEditorImpl);
