/**
 * PR-7b: Read-only derivation shim for legacy text projections.
 *
 * Background: `contentDoc` (EditorDoc) je SSOT od PR-7b. Stari konzumeri
 * koji su čitali `section.content` (HTML), `source.htmlContent` (HTML) ili
 * `article.content` (markdown) sada moraju da derivati iz AST-a. Da ne bi
 * svaka snippet-preview / export / search ruta plaćala konverziju iznova,
 * cache po `EditorDoc` referenci (WeakMap). Pošto write-path uvijek alocira
 * NOVI doc objekat (TipTap immutable), invalidacija je automatska.
 *
 * KRITIČNO: ove funkcije ne smiju da se zovu iz `onChange` / `onUpdate`
 * keystroke loop-a. Tamo se samo `contentDoc` ažurira u state-u. Derivacija
 * je read-only — dešava se kad listing / pretraga / export pita za string.
 */
import type { EditorDoc } from "./types";
import { docToHtml } from "./codecs/doc-to-html";
import { docToMarkdown } from "./codecs/doc-to-markdown";
import { docToPlainText } from "./codecs/doc-to-text";

const htmlCache = new WeakMap<EditorDoc, string>();
const mdCache = new WeakMap<EditorDoc, string>();
const textCache = new WeakMap<EditorDoc, string>();

export function deriveHtml(doc: EditorDoc | null | undefined): string {
  if (!doc) return "";
  const hit = htmlCache.get(doc);
  if (hit !== undefined) return hit;
  const out = docToHtml(doc);
  htmlCache.set(doc, out);
  return out;
}

export function deriveMarkdown(doc: EditorDoc | null | undefined): string {
  if (!doc) return "";
  const hit = mdCache.get(doc);
  if (hit !== undefined) return hit;
  const out = docToMarkdown(doc);
  mdCache.set(doc, out);
  return out;
}

export function derivePlainText(doc: EditorDoc | null | undefined): string {
  if (!doc) return "";
  const hit = textCache.get(doc);
  if (hit !== undefined) return hit;
  const out = docToPlainText(doc);
  textCache.set(doc, out);
  return out;
}

export function isDocEmpty(doc: EditorDoc | null | undefined): boolean {
  if (!doc || !doc.content) return true;
  return derivePlainText(doc).trim().length === 0;
}
