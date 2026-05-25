import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { DOMParser, type Slice } from "@tiptap/pm/model";
import { preprocessHtml } from "../patterns";


/**
 * `SmartPaste` — single-source-of-truth for converting raw `[[wiki]]` and
 * `::mindmap[id]` syntax pasted from any source (plain text, HTML clipboard,
 * Word, Notion) into proper `wikiLink` / `mindmapEmbed` nodes.
 *
 * Why a plugin (and not `nodePasteRule`):
 *   - `mindmapEmbed` is block-level + atom; node paste rules in TipTap v3 do
 *     not reliably split paragraphs around block atoms.
 *   - We already own `preprocessHtml` — the same regex pipeline that
 *     `htmlToDoc` uses on backup import. Re-using it here guarantees that
 *     paste-time and import-time produce identical ASTs (zero data-loss
 *     invariant from PR-3).
 *
 * Strategy:
 *   - On paste, ALWAYS funnel through `preprocessHtml` (text → HTML string →
 *     preprocessor → ProseMirror DOMParser). For pure plain-text payloads
 *     we wrap text into paragraphs first so paragraph boundaries survive.
 *   - We never call `dangerouslySetInnerHTML` — the DOMParser runs against
 *     a detached template element and emits a `Slice` for the transaction.
 */
const smartPasteKey = new PluginKey("editor-v4-smart-paste");

export const SmartPaste = Extension.create({
  name: "smartPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: smartPasteKey,
        props: {
          handlePaste(view, event) {
            const cd = event.clipboardData;
            if (!cd) return false;

            const html = cd.getData("text/html");
            const text = cd.getData("text/plain");
            const hasWiki = /\[\[[^\[\]|]+?(\|[^\[\]]+?)?\]\]/.test(text + html);
            const hasMindmap = /::mindmap\[[^\]\s]{8,}\]/.test(text + html);
            if (!hasWiki && !hasMindmap) return false; // nothing to enrich → default handler

            // Prefer HTML payload (structure preserved); fall back to text.
            const rawHtml = html && html.trim()
              ? html
              : textToHtml(text);
            const preprocessed = preprocessHtml(rawHtml);

            const slice = parseSlice(preprocessed, view);
            if (!slice) return false;

            const tr = view.state.tr.replaceSelection(slice).scrollIntoView();
            view.dispatch(tr);
            // No manual `update` emit needed — view.dispatch already does it
            // through the editor's transaction pipeline.
            void editor;
            return true;
          },
        },
      }),
    ];
  },
});

/** Wrap raw text into minimal HTML so block boundaries survive parsing. */
function textToHtml(text: string): string {
  // Split into blocks on blank lines; preserve single newlines as hard breaks.
  const blocks = text.split(/\n{2,}/);
  return blocks
    .map((b) => {
      const escaped = escape(b).replace(/\n/g, "<br>");
      return `<p>${escaped}</p>`;
    })
    .join("");
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

interface ViewLike {
  state: { schema: import("@tiptap/pm/model").Schema };
}

function parseSlice(html: string, view: ViewLike): Slice | null {
  if (typeof document === "undefined") return null;
  const template = document.createElement("template");
  template.innerHTML = html;
  // ProseMirror's DOMParser walks the schema's parseRules — including ours
  // for wikiLink (`a[data-wikilink]`) and mindmapEmbed (`div[data-mindmap]`).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DOMParser } = require("@tiptap/pm/model") as typeof import("@tiptap/pm/model");
  const parser = DOMParser.fromSchema(view.state.schema);
  return parser.parseSlice(template.content);
}
