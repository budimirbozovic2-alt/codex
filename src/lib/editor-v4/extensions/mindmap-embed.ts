import { Node, mergeAttributes } from "@tiptap/core";

/**
 * `mindmapEmbed` — block-level atomic node representing `::mindmap[id]`.
 *
 * DOM shape: `<div data-mindmap="id"></div>`. The nodeView that renders an
 * actual mind-map canvas is wired up in PR-4/PR-6; this extension is only
 * concerned with schema and lossless round-tripping.
 */
export const MindmapEmbed = Node.create({
  name: "mindmapEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

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
});
