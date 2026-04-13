import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { SourceEditToolbar } from "./SourceEditToolbar";

interface Props {
  html: string;
  onMouseUp: () => void;
  contentRef: React.RefObject<HTMLDivElement>;
  editMode?: boolean;
  onFormat?: (command: string, value?: string) => void;
  onInput?: () => void;
}

export const SourceContent = memo(function SourceContent({
  html, onMouseUp, contentRef, editMode, onFormat, onInput,
}: Props) {
  const initializedRef = useRef(false);
  const safeHtml = useMemo(() => sanitizeHtml(html), [html]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (editMode) return;
    const target = e.target as HTMLElement;
    const heading = target.closest("h1, h2, h3");
    if (heading && heading.id) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [editMode]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!editMode) return;
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "b") { e.preventDefault(); onFormat?.("bold"); }
      else if (e.key === "i") { e.preventDefault(); onFormat?.("italic"); }
      else if (e.key === "u") { e.preventDefault(); onFormat?.("underline"); }
    }
  }, [editMode, onFormat]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (!editMode) return;
    const items = e.clipboardData?.items;
    if (items) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            document.execCommand("insertHTML", false, `<img src="${reader.result}" style="max-width:100%" />`);
            onInput?.();
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  }, [editMode, onInput]);

  const enhanceHeadings = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    (contentRef as React.MutableRefObject<HTMLDivElement>).current = node;

    if (editMode) {
      // In edit mode, set innerHTML only once (avoid cursor reset)
      if (!initializedRef.current) {
        node.innerHTML = safeHtml;
        initializedRef.current = true;
      }
    } else {
      initializedRef.current = false;
    }

    node.querySelectorAll("h1[id], h2[id], h3[id]").forEach(h => {
      if (h.querySelector(".heading-link-icon")) return;
      const icon = document.createElement("span");
      icon.className = "heading-link-icon";
      icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
      h.appendChild(icon);
    });
  }, [contentRef, safeHtml, editMode]);

  // Reset initialized flag when switching out of edit mode
  useEffect(() => {
    if (!editMode) initializedRef.current = false;
  }, [editMode]);

  const contentClass = `rounded-lg border bg-card p-6 prose prose-sm max-w-none
    prose-headings:text-foreground prose-headings:cursor-pointer prose-headings:hover:text-primary prose-headings:transition-colors
    prose-p:text-foreground/90
    prose-strong:text-foreground prose-a:text-primary
    prose-ul:text-foreground/90 prose-ol:text-foreground/90
    prose-li:text-foreground/90
    [&_h1[id]]:relative [&_h1[id]]:group [&_h2[id]]:relative [&_h2[id]]:group [&_h3[id]]:relative [&_h3[id]]:group
    [&_.heading-link-icon]:inline-flex [&_.heading-link-icon]:items-center [&_.heading-link-icon]:ml-2
    [&_.heading-link-icon]:text-muted-foreground/40 [&_.heading-link-icon]:opacity-0
    [&_h1:hover_.heading-link-icon]:opacity-100 [&_h2:hover_.heading-link-icon]:opacity-100 [&_h3:hover_.heading-link-icon]:opacity-100
    [&_.heading-link-icon]:transition-opacity [&_.heading-link-icon]:duration-200
    ${editMode ? "outline-none ring-1 ring-primary/30 focus:ring-primary/60" : ""}`;

  return (
    <div className="space-y-2">
      {editMode && onFormat && (
        <SourceEditToolbar onFormat={onFormat} />
      )}
      <div
        ref={enhanceHeadings}
        className={contentClass}
        contentEditable={editMode}
        suppressContentEditableWarning
        onMouseUp={onMouseUp}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onInput={onInput}
        {...(!editMode ? { dangerouslySetInnerHTML: { __html: safeHtml } } : {})}
      />
    </div>
  );
});
