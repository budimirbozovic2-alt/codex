import StarterKit from "@tiptap/starter-kit";
import { Highlight } from "@tiptap/extension-highlight";
import type { Extensions } from "@tiptap/core";
import { WikiLink } from "./extensions/wiki-link";
import { MindmapEmbed } from "./extensions/mindmap-embed";
import { KeyPart } from "./extensions/key-part";

/**
 * The canonical TipTap extension set for V4 documents.
 *
 * StarterKit v3 already includes paragraph, heading, bold, italic, underline,
 * strike, code, code-block, blockquote, hard-break, horizontal-rule, history,
 * link, bullet/ordered list and list-item. We only add what is missing:
 * Highlight (generic `<mark>`) and our three domain extensions.
 *
 * KeyPart is ordered BEFORE Highlight so its `mark.key-part-highlight`
 * parseHTML rule wins over Highlight's generic `mark` rule (TipTap matches
 * extension order when priorities are equal).
 *
 * Single source of truth — both codecs and the future `<EditorV4 />`
 * component MUST consume this array unchanged so the schema stays
 * identical across read/write paths.
 */
export const editorV4Extensions: Extensions = [
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { class: "underline text-primary" },
    },
  }),
  KeyPart,
  Highlight,
  WikiLink,
  MindmapEmbed,
];
