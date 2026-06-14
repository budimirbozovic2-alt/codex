/**
 * Source HTML Pipeline — pure (and DOM-pure) transforms used by the
 * source-editing flows. Eliminates the duplicated "sanitize → injectIds →
 * outline → parseArticles → saveSource" sequence that previously appeared
 * in 4 callbacks.
 */
import { extractOutline, injectHeadingIds, type Source } from "@/domains/sources/sources-storage";
import { parseArticles } from "@/lib/article-parser";

export { extractOutlineFromDoc } from "./heading-navigation";

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
