import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import EmbeddedMindMap from "@/components/zettelkasten/EmbeddedMindMap";

/**
 * React NodeView for the `mindmapEmbed` block atom.
 *
 * Reads the host categoryId from `editor.storage.mindmapEmbed.categoryId`
 * (set by `<EditorV4>` at instantiation). When no categoryId is configured
 * — e.g. the editor lives outside a subject route — we render an inert
 * fallback chip instead of crashing the embed.
 */
export function MindmapEmbedNodeView({ node, editor }: NodeViewProps) {
  const mindmapId = String(node.attrs.mindmapId ?? "");
  const storage = (editor.storage as Record<string, unknown>).mindmapEmbed as { categoryId?: string } | undefined;
  const categoryId = storage?.categoryId ?? "";

  return (
    <NodeViewWrapper
      as="div"
      className="mindmap-embed not-prose"
      data-mindmap={mindmapId}
      contentEditable={false}
    >
      {categoryId && mindmapId ? (
        <EmbeddedMindMap mindMapId={mindmapId} categoryId={categoryId} />
      ) : (
        <div className="my-4 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Mapa uma (id: <code className="font-mono">{mindmapId || "?"}</code>)
        </div>
      )}
    </NodeViewWrapper>
  );
}
