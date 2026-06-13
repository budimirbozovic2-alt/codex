/**
 * PR-7e M3: Top-level block splitter for `EditorDoc`.
 *
 * Replaces the legacy HTML round-trip used by the Cutting view
 * (paragraph splitter). Operates directly on the ProseMirror JSON AST —
 * no HTML parse, no `document.createElement`, no innerHTML.
 *
 * A "top-level block" is any direct child of the `doc` node (paragraph,
 * heading, blockquote, list, code block, etc.). Splitting preserves
 * marks and node attrs because we deep-reference the original block JSON.
 */
import type { EditorDoc, JSONContent } from "./types";

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

/** Return an array of single-block `EditorDoc`s, one per top-level block. */
export function splitDocByTopLevelBlocks(doc: EditorDoc | null | undefined): EditorDoc[] {
  if (!doc || !doc.content) return [];
  const root = doc.content;
  const blocks: JSONContent[] = Array.isArray(root.content) ? root.content : [];
  return blocks.map((b) => ({
    version: 4,
    content: { type: "doc", content: [b] },
  }));
}

/** Inverse of `splitDocByTopLevelBlocks`. */
export function joinTopLevelBlocks(blocks: EditorDoc[]): EditorDoc {
  if (!blocks || blocks.length === 0) return EMPTY_DOC;
  const merged: JSONContent[] = [];
  for (const d of blocks) {
    const kids = Array.isArray(d?.content?.content) ? d.content.content : [];
    for (const k of kids) merged.push(k);
  }
  return { version: 4, content: { type: "doc", content: merged } };
}

/** Slice `doc` into `before` (blocks [0..i)) and `after` (blocks [i..]). */
export function sliceDocAtBlock(doc: EditorDoc, blockIndex: number): { before: EditorDoc; after: EditorDoc } {
  const blocks = splitDocByTopLevelBlocks(doc);
  const i = Math.max(0, Math.min(blockIndex, blocks.length));
  return {
    before: joinTopLevelBlocks(blocks.slice(0, i)),
    after: joinTopLevelBlocks(blocks.slice(i)),
  };
}

/** Plain-text projection of a single block — used to seed split titles. */
export function blockPlainText(block: EditorDoc): string {
  let out = "";
  const walk = (n: JSONContent | undefined) => {
    if (!n) return;
    if (n.type === "text" && typeof n.text === "string") out += n.text + " ";
    if (Array.isArray(n.content)) for (const c of n.content) walk(c);
  };
  walk(block.content);
  return out.replace(/\s+/g, " ").trim();
}
