import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import type { Extensions } from "@tiptap/core";
import { WikiLink } from "./extensions/wiki-link";
import { MindmapEmbed } from "./extensions/mindmap-embed";
import { KeyPart } from "./extensions/key-part";

/**
 * The canonical TipTap extension set for V4 documents.
 *
 * StarterKit already includes paragraph, heading, bold, italic, strike,
 * code, code-block, blockquote, hard-break, horizontal-rule, history,
 * bullet/ordered list and list-item. Link is also included by StarterKit;
 * we re-configure it explicitly to disable `openOnClick` and to keep
 * autolink behaviour predictable across read/write surfaces.
 *
 * This array is the SINGLE source of truth — both codecs (`htmlToDoc`,
 * `docToHtml`) and the future `<EditorV4 />` component must consume it
 * unchanged so the schema stays identical across paths.
 */
export const editorV4Extensions: Extensions = [
  StarterKit.configure({
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { class: "underline text-primary" },
    },
  }),
  Underline,
  Highlight,
  Link.configure({ openOnClick: false }),
  WikiLink,
  MindmapEmbed,
  KeyPart,
];
