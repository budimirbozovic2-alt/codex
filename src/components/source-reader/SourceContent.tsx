import { memo, useCallback } from "react";

/**
 * Props for the SourceContent component.
 */
interface Props {
  /** The sanitized HTML content of the source */
  html: string;
  /** Callback for when mouse selection is released */
  onMouseUp: () => void;
  /** Ref to the content container element */
  contentRef: React.RefObject<HTMLDivElement>;
}

/**
 * Memoized component that renders the source's HTML content.
 * Includes logic for enhancing headings with link icons and handling heading navigation clicks.
 */
export const SourceContent = memo(function SourceContent({ html, onMouseUp, contentRef }: Props) {
  /**
   * Handles clicking on headings with IDs to scroll them into view.
   */
  const handleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const heading = target.closest("h1, h2, h3");
    if (heading && heading.id) {
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  /**
   * Ref callback to enhance headings with SVG link icons after initial render.
   */
  const enhanceHeadings = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    (contentRef as React.MutableRefObject<HTMLDivElement>).current = node;
    node.querySelectorAll("h1[id], h2[id], h3[id]").forEach(h => {
      if (h.querySelector(".heading-link-icon")) return;
      const icon = document.createElement("span");
      icon.className = "heading-link-icon";
      icon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
      h.appendChild(icon);
    });
  }, [contentRef]);

  return (
    <div
      ref={enhanceHeadings}
      className="rounded-lg border bg-card p-6 prose prose-sm max-w-none
        prose-headings:text-foreground prose-headings:cursor-pointer prose-headings:hover:text-primary prose-headings:transition-colors
        prose-p:text-foreground/90
        prose-strong:text-foreground prose-a:text-primary
        prose-ul:text-foreground/90 prose-ol:text-foreground/90
        prose-li:text-foreground/90
        [&_h1[id]]:relative [&_h1[id]]:group [&_h2[id]]:relative [&_h2[id]]:group [&_h3[id]]:relative [&_h3[id]]:group
        [&_.heading-link-icon]:inline-flex [&_.heading-link-icon]:items-center [&_.heading-link-icon]:ml-2
        [&_.heading-link-icon]:text-muted-foreground/40 [&_.heading-link-icon]:opacity-0
        [&_h1:hover_.heading-link-icon]:opacity-100 [&_h2:hover_.heading-link-icon]:opacity-100 [&_h3:hover_.heading-link-icon]:opacity-100
        [&_.heading-link-icon]:transition-opacity [&_.heading-link-icon]:duration-200"
      onMouseUp={onMouseUp}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
