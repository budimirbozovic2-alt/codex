import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MindmapEmbedNodeView } from "./MindmapEmbedNodeView";

/**
 * `mindmapEmbed` — block-level atomic node representing `::mindmap[id]`.
 *
 * DOM shape: `<div data-mindmap="id"></div>`. NodeView (PR-6) renders the
 * actual mind-map snapshot via `EmbeddedMindMap`, reading `categoryId`
 * from `editor.storage.mindmapEmbed.categoryId`.
 */
export const MindmapEmbed = Node.create({
  name: "mindmapEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addStorage() {
    return { categoryId: "" as string };
  },

  addAttributes() {
    return {
      mindmapId: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-mindmap]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const id = el.getAttribute("data-mindmap") ?? "";
          if (!id) return false;
          return { mindmapId: id };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-mindmap": String(node.attrs.mindmapId ?? ""),
        class: "mindmap-embed",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MindmapEmbedNodeView);
  },
});

