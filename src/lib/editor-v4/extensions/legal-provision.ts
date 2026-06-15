import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    legalProvision: {
      wrapInLegalProvision: () => ReturnType;
      liftLegalProvision: () => ReturnType;
      toggleLegalProvision: () => ReturnType;
    };
  }
}

/**
 * `legalProvision` — block wrapper for statutory text excerpts in skripta sources.
 *
 * DOM shape: `<div class="legal-provision">…</div>`. Visually distinct from
 * surrounding theory prose; used only in script sources (UI gated in SourceBubbleMenu).
 */
export const LegalProvision = Node.create({
  name: "legalProvision",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [
      {
        tag: "div.legal-provision",
        priority: 60,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "legal-provision" }),
      0,
    ];
  },

  addCommands() {
    return {
      wrapInLegalProvision:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),

      liftLegalProvision:
        () =>
        ({ commands }) =>
          commands.lift(this.name),

      toggleLegalProvision:
        () =>
        ({ commands, state }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === this.name) {
              return commands.lift(this.name);
            }
          }
          return commands.wrapIn(this.name);
        },
    };
  },
});
