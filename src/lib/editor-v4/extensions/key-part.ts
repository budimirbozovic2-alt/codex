import { Mark, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    keyPart: {
      setKeyPart: () => ReturnType;
      unsetKeyPart: () => ReturnType;
      toggleKeyPart: () => ReturnType;
    };
  }
}

/**
 * `keyPart` — inline mark for examiner-style highlighted phrases.
 *
 * `inclusive: false` so typing past the boundary does NOT extend the mark.
 *
 * DOM shape: `<mark class="key-part-highlight">…</mark>` — matches the
 * existing `highlight-key-parts.ts` runtime output so legacy HTML payloads
 * round-trip into this mark without data loss.
 *
 * Commands (`setKeyPart`/`unsetKeyPart`/`toggleKeyPart`) are chain-friendly
 * so `<SourceBubbleMenu>` can wire `editor.chain().focus().toggleKeyPart().run()`.
 */
export const KeyPart = Mark.create({
  name: "keyPart",
  inclusive: false,

  parseHTML() {
    return [
      {
        tag: "mark.key-part-highlight",
        priority: 60,
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

  addCommands() {
    return {
      setKeyPart: () => ({ commands }) => commands.setMark(this.name),
      unsetKeyPart: () => ({ commands }) => commands.unsetMark(this.name),
      toggleKeyPart: () => ({ commands }) => commands.toggleMark(this.name),
    };
  },
});
