/**
 * Mnemonic section codec — contentDoc SSOT with legacy HTML read boundary.
 *
 * Writers persist `contentDoc` only. Legacy `content` HTML is accepted on
 * decode (SQLite / backup payloads) and synthesized via `seedSectionDoc`.
 */
import { htmlToDoc } from "@/lib/editor-v4";
import type { EditorDoc } from "@/lib/editor-v4/types";
import { deriveHtml } from "@/lib/editor-v4/derived";
import type { MnemonicCard, MnemonicSection } from "./types";

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

function isV4Doc(doc: unknown): doc is EditorDoc {
  return (
    !!doc &&
    typeof doc === "object" &&
    (doc as { version?: number }).version === 4 &&
    !!(doc as { content?: unknown }).content
  );
}

/** Canonical v4 AST — prefers contentDoc, falls back to legacy HTML. */
export function seedSectionDoc(section: MnemonicSection): EditorDoc {
  if (isV4Doc(section.contentDoc)) return section.contentDoc;
  const html = section.content ?? "";
  if (!html.trim()) return EMPTY_DOC;
  try {
    return htmlToDoc(html);
  } catch {
    return EMPTY_DOC;
  }
}

/** Legacy HTML projection for content-utils / backup import boundaries. */
export function getMnemonicSectionHtml(section: MnemonicSection): string {
  return deriveHtml(seedSectionDoc(section));
}

/** Decode path: normalize sections to contentDoc-only runtime shape. */
export function normalizeSectionOnRead(section: MnemonicSection): MnemonicSection {
  return {
    title: section.title,
    contentDoc: seedSectionDoc(section),
  };
}

/** Write path: persist contentDoc only — never dual-write legacy HTML. */
export function normalizeSectionForWrite(
  section: Pick<MnemonicSection, "title"> & { contentDoc: EditorDoc },
): MnemonicSection {
  return {
    title: section.title,
    contentDoc: section.contentDoc,
  };
}

function sectionNeedsMigration(section: MnemonicSection): boolean {
  if (!isV4Doc(section.contentDoc)) return true;
  return section.content !== undefined;
}

/** Decode/normalize a full card (repo read + idle migration). */
export function normalizeMnemonicCardOnRead(card: MnemonicCard): MnemonicCard {
  return {
    ...card,
    sections: card.sections.map(normalizeSectionOnRead),
  };
}

/** Strip legacy fields and persist canonical sections (repo write). */
export function normalizeMnemonicCardForWrite(card: MnemonicCard): MnemonicCard {
  return {
    ...card,
    sections: card.sections.map((s) =>
      normalizeSectionForWrite({
        title: s.title,
        contentDoc: seedSectionDoc(s),
      }),
    ),
  };
}

/** Idempotent migration helper for idle backfill of legacy SQLite rows. */
export function migrateMnemonicCard(
  card: MnemonicCard,
): { record: MnemonicCard; changed: boolean } {
  if (!card.sections.some(sectionNeedsMigration)) {
    return { record: card, changed: false };
  }
  return {
    record: normalizeMnemonicCardForWrite(card),
    changed: true,
  };
}
