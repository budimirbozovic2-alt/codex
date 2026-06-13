import { AstNodeRenderer } from "./AstNodeRenderer";
import type { EditorDoc } from "@/lib/editor-v4";

interface Props {
  /** Canonical V4 AST. Required since PR-7d M2.1. */
  doc?: EditorDoc | null;
  className?: string;
  onWikiLinkClick?: (target: string) => void;
  onMindmapClick?: (mindmapId: string) => void;
  /** When set, `mindmapEmbed` nodes render live previews instead of placeholders. */
  categoryId?: string;
}

/**
 * Read-path adapter — PR-7d M2.1.
 *
 * Renders the canonical V4 AST through `<AstNodeRenderer>`, a pure React
 * walker (no TipTap, no DOM mutations). This is the standard surface for
 * read-only content in virtualised lists, dialogs, previews and study UIs.
 *
 * For interactive rich surfaces (Zettelkasten article body, etc.) import
 * `<EditorView>` from `@/lib/editor-v4` directly.
 */
export function ContentRenderer({ doc, className, onWikiLinkClick, onMindmapClick, categoryId }: Props) {
  return (
    <AstNodeRenderer
      doc={doc}
      className={className}
      onWikiLinkClick={onWikiLinkClick}
      onMindmapClick={onMindmapClick}
      categoryId={categoryId}
    />
  );
}
