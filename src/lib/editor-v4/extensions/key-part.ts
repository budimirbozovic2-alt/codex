import { Mark, mergeAttributes } from "@tiptap/core";

/**
 * `keyPart` — inline mark for examiner-style highlighted phrases.
 *
 * `inclusive: false` so typing past the boundary does NOT extend the mark,
 * which matches author intent (highlight is a fixed span, not a growing one).
 *
 * DOM shape: `<mark class="key-part-highlight">…</mark>` — matches the
 * existing `highlight-key-parts.ts` runtime output so legacy HTML payloads
 * round-trip into this mark without data loss.
 */
export const KeyPart = Mark.create({
  name: "keyPart",
  inclusive: false,

  parseHTML() {
    return [
      {
        tag: "mark.key-part-highlight",
      },
      {
        tag: "mark",
        getAttrs: (el) => {
          if (!(el instanceof HTMLElement)) return false;
          return el.classList.contains("key-part-highlight") ? {} : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      mergeAttributes(HTMLAttributes, { class: "key-part-highlight" }),
      0,
    ];
  },
});
