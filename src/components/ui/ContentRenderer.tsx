import { useMemo } from "react";
import { SafeHtml } from "@/components/ui/safe-html";
import { EditorView } from "@/lib/editor-v4/EditorView";
import type { EditorDoc } from "@/lib/editor-v4";
import {
  highlightKeyParts,
  type KeyPartsMatcher,
} from "@/lib/highlight-key-parts";

interface Props {
  /**
   * Canonical V4 AST. When present and `version === 4`, render path uses TipTap.
   * Otherwise the component falls back to sanitized HTML.
   */
  doc?: EditorDoc | null;
  /** Legacy HTML — required as fallback while migration backfill is in flight. */
  html: string;
  className?: string;
  /**
   * Highlight directive for key parts. Only applied to the SafeHtml fallback
   * branch — in the AST branch, key parts are stored as proper `keyPart` marks.
   */
  highlight?: { keyParts?: string[] | null; matcher?: KeyPartsMatcher | null } | null;
}

function isV4Doc(d: EditorDoc | null | undefined): d is EditorDoc {
  return !!d && d.version === 4 && !!d.content;
}

/**
 * Read-path adapter — switches between the new AST `<EditorView>` and the
 * legacy `<SafeHtml>` path based on whether `contentDoc` has been migrated.
 *
 * Call-sites stay agnostic of TipTap; once lazy migration covers the whole
 * dataset, `html` becomes unused and we can drop the fallback wholesale.
 */
export function ContentRenderer({ doc, html, className, highlight }: Props) {
  const fallbackHtml = useMemo(() => {
    if (!highlight) return html;
    const matcher = highlight.matcher ?? highlight.keyParts ?? null;
    return highlightKeyParts(html, matcher);
  }, [html, highlight]);

  if (isV4Doc(doc)) {
    return <EditorView doc={doc} className={className} />;
  }

  return <SafeHtml className={className} html={fallbackHtml} trusted={!!highlight} />;
}
