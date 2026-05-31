/**
 * Source HTML Pipeline — pure (and DOM-pure) transforms used by the
 * source-editing flows. Eliminates the duplicated "sanitize → injectIds →
 * outline → parseArticles → saveSource" sequence that previously appeared
 * in 4 callbacks.
 */
import { extractOutline, injectHeadingIds, type Source } from "@/lib/sources-storage";
import { parseArticles } from "@/lib/article-parser";

/**
 * Rebuild outline + articles from raw container HTML. `contentDoc` (AST) is
 * the SSOT for the source body — callers that derive HTML from the AST and
 * then call this helper should re-attach the doc afterwards. Does not persist.
 */
export function rebuildSourceFromHtml(source: Source, rawHtml: string): Source {
  const updatedHtml = injectHeadingIds(rawHtml);
  return {
    ...source,
    outline: extractOutline(updatedHtml),
    articles: parseArticles(updatedHtml),
    updatedAt: Date.now(),
  };
}

/** Replace a block element with a heading or paragraph in-place. Returns true if changed. */
export function applyHeadingChange(el: HTMLElement, level: number | null): boolean {
  const currentTag = el.tagName.toLowerCase();
  const targetTag = level ? `h${level}` : "p";
  if (currentTag === targetTag) return false;
  const newEl = document.createElement(targetTag);
  newEl.textContent = el.textContent || "";
  el.replaceWith(newEl);
  return true;
}

const BLOCK_TAGS = ["p", "div", "h1", "h2", "h3", "h4", "li"];

export function collectIntersectingBlocks(container: HTMLElement, range: Range): HTMLElement[] {
  const blocks: HTMLElement[] = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as HTMLElement;
      if (BLOCK_TAGS.includes(el.tagName.toLowerCase()) && range.intersectsNode(el)) {
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_SKIP;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) blocks.push(node as HTMLElement);
  return blocks;
}

/** Wrap intersecting blocks into a list element. Returns true if any blocks were wrapped. */
export function applyListWrap(container: HTMLElement, range: Range, type: "ol" | "ul"): boolean {
  const blocks = collectIntersectingBlocks(container, range);
  if (blocks.length === 0) return false;
  const listEl = document.createElement(type);
  blocks[0].before(listEl);
  for (const block of blocks) {
    const li = document.createElement("li");
    li.innerHTML = block.innerHTML;
    listEl.appendChild(li);
    block.remove();
  }
  return true;
}
