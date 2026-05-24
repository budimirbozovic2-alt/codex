import { Node, mergeAttributes } from "@tiptap/core";

/**
 * `wikiLink` — inline atomic node representing `[[Target]]` / `[[Target|display]]`.
 *
 * Stored attrs:
 *   - `target`  canonical article title (case preserved)
 *   - `display` rendered text (equals target unless piped)
 *   - `hasPipe` whether the source used the piped form
 *
 * DOM shape: `<a data-wikilink="target" data-display="display">display</a>`.
 */
export const WikiLink = Node.create({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: { default: "" },
      display: { default: "" },
      hasPipe: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: "a[data-wikilink]",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          const target = el.getAttribute("data-wikilink") ?? "";
          if (!target) return false;
          const display = el.getAttribute("data-display") ?? el.textContent ?? target;
          return { target, display, hasPipe: display !== target };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const target = String(node.attrs.target ?? "");
    const display = String(node.attrs.display ?? target);
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-wikilink": target,
        "data-display": display,
        class: "wiki-link",
      }),
      display,
    ];
  },
});
