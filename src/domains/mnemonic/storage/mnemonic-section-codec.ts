/**
 * Mnemonic section codec — contentDoc SSOT.
 *
 * Legacy `content` HTML is accepted only at import boundaries
 * (`decodeLegacySection`, `normalizeMnemonicCardOnImport`).
 */
import { htmlToDoc } from "@/lib/editor-v4";
import type { EditorDoc } from "@/lib/editor-v4/types";
import type { MnemonicCard, MnemonicSection } from "../types";

export const EMPTY_MNEMONIC_DOC: EditorDoc = {
  version: 4,
  content: { type: "doc", content: [{ type: "paragraph" }] },
};

/** Legacy section shape at SQLite/backup import boundary — not used at runtime. */
export interface LegacyMnemonicSectionPayload {
  title: string;
  contentDoc?: unknown;
  content?: string;
}

function isV4Doc(doc: unknown): doc is EditorDoc {
  return (
    !!doc &&
    typeof doc === "object" &&
    (doc as { version?: number }).version === 4 &&
    !!(doc as { content?: unknown }).content
  );
}

/** Import boundary: legacy HTML → canonical contentDoc. */
export function decodeLegacySection(raw: LegacyMnemonicSectionPayload): MnemonicSection {
  if (isV4Doc(raw.contentDoc)) {
    return { title: raw.title, contentDoc: raw.contentDoc };
  }
  const html = raw.content ?? "";
  if (html.trim()) {
    try {
      return { title: raw.title, contentDoc: htmlToDoc(html) };
    } catch {
      return { title: raw.title, contentDoc: EMPTY_MNEMONIC_DOC };
    }
  }
  return { title: raw.title, contentDoc: EMPTY_MNEMONIC_DOC };
}

export function normalizeSectionOnRead(section: MnemonicSection): MnemonicSection {
  return {
    title: section.title,
    contentDoc: isV4Doc(section.contentDoc) ? section.contentDoc : EMPTY_MNEMONIC_DOC,
  };
}

export function normalizeSectionForWrite(section: MnemonicSection): MnemonicSection {
  return {
    title: section.title,
    contentDoc: section.contentDoc,
  };
}

export function normalizeMnemonicCardOnRead(card: MnemonicCard): MnemonicCard {
  return {
    ...card,
    sections: card.sections.map(normalizeSectionOnRead),
  };
}

/** Import boundary: raw SQLite/backup payload → runtime MnemonicCard. */
export function normalizeMnemonicCardOnImport(raw: Record<string, unknown>): MnemonicCard {
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((s) => decodeLegacySection(s as LegacyMnemonicSectionPayload))
    : [];
  return normalizeMnemonicCardOnRead({ ...(raw as MnemonicCard), sections });
}

export function normalizeMnemonicCardForWrite(card: MnemonicCard): MnemonicCard {
  return {
    ...card,
    sections: card.sections.map(normalizeSectionForWrite),
  };
}

export function migrateMnemonicCard(
  card: MnemonicCard,
): { record: MnemonicCard; changed: boolean } {
  const changed = card.sections.some((s) => !isV4Doc(s.contentDoc));
  return {
    record: normalizeMnemonicCardOnRead(card),
    changed,
  };
}
