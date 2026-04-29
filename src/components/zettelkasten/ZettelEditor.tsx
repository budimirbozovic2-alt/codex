import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Heading2, List, Link2, Code, Map as MapIcon } from "lucide-react";

export interface ZettelEditorHandle {
  insertText: (text: string) => void;
  /** Insert `text` as a standalone block: guarantees blank line before & after, regardless of cursor position. */
  insertBlock: (text: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  /** Fires synchronously on every input — parent should hold this in a draft state, NOT persist. */
  onChange: (next: string) => void;
  placeholder?: string;
  onInsertMindMap?: () => void;
}

/** Minimal markdown editor with toolbar; supports [[wiki-links]] and ::mindmap[] embeds. */
const ZettelEditor = forwardRef<ZettelEditorHandle, Props>(function ZettelEditor(
  { value, onChange, placeholder, onInsertMindMap },
  ref,
) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const wrap = useCallback((before: string, after: string = before, ph = "") => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || ph;
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = start + before.length;
      ta.setSelectionRange(cursorStart, cursorStart + selected.length);
    });
  }, [value, onChange]);

  const insertAtLineStart = useCallback((prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }, [value, onChange]);

  const insertText = useCallback((text: string) => {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  }, [value, onChange]);

  const insertBlock = useCallback((text: string) => {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);

    // Compute leading newlines: want exactly `\n\n` before block (i.e. blank line),
    // unless we're at the very start of the document (no leading newlines needed).
    let prefix = "";
    if (before.length > 0) {
      if (before.endsWith("\n\n")) prefix = "";
      else if (before.endsWith("\n")) prefix = "\n";
      else prefix = "\n\n";
    }

    // Compute trailing newlines: want `\n\n` after block so next content is on a new paragraph,
    // unless we're at the end of the document (single `\n` is enough to terminate the line).
    let suffix = "";
    if (after.length === 0) {
      suffix = "\n";
    } else {
      if (after.startsWith("\n\n")) suffix = "";
      else if (after.startsWith("\n")) suffix = "\n";
      else suffix = "\n\n";
    }

    const insertion = prefix + text + suffix;
    const next = before + insertion + after;
    onChange(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      // Place caret right after the block + its first trailing newline,
      // so the user can immediately start typing on a fresh line.
      const caret = start + prefix.length + text.length + Math.min(1, suffix.length);
      ta.setSelectionRange(caret, caret);
    });
  }, [value, onChange]);

  useImperativeHandle(ref, () => ({
    insertText,
    insertBlock,
    focus: () => taRef.current?.focus(),
  }), [insertText, insertBlock]);

  return (
    <div className="flex flex-col h-full border border-border rounded-md bg-card">
      <div className="flex items-center gap-1 p-2 border-b border-border flex-wrap">
        <Button type="button" size="sm" variant="ghost" onClick={() => wrap("**", "**", "tekst")} aria-label="Bold">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => wrap("*", "*", "tekst")} aria-label="Italic">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => wrap("`", "`", "kod")} aria-label="Code">
          <Code className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => insertAtLineStart("## ")} aria-label="Heading 2">
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => insertAtLineStart("- ")} aria-label="List">
          <List className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => wrap("[[", "]]", "Naslov članka")}
          className="gap-1.5"
          aria-label="Wiki link"
        >
          <Link2 className="h-4 w-4" />
          <span className="text-xs">Wiki-link</span>
        </Button>
        {onInsertMindMap && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onInsertMindMap}
            className="gap-1.5"
            aria-label="Umetni mapu uma"
          >
            <MapIcon className="h-4 w-4" />
            <span className="text-xs">Umetni mapu</span>
          </Button>
        )}
      </div>
      <Textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Napišite svoju bilješku u markdownu...\n\nKoristite [[Naslov članka]] za povezivanje, ::mindmap[id] za mapu uma."}
        className="flex-1 resize-none border-0 rounded-none rounded-b-md font-mono text-sm leading-relaxed focus-visible:ring-0"
      />
      <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t border-border flex justify-between">
        <span>Markdown · `**bold**` · `*italic*` · `## naslov` · `[[Wiki Link]]` · `::mindmap[id]`</span>
        <span>{value.length} znakova</span>
      </div>
    </div>
  );
});

export default ZettelEditor;
