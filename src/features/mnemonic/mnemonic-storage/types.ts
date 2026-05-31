// Public + internal types for the mnemonic-storage module.
// See ./index.ts for the public barrel.

import type { EditorDoc } from "@/lib/editor-v4/types";

export type MnemonicStatus = "new" | "in-workshop" | "ready";
export type HookType = "rokovi" | "nabrajanja" | "ostalo";
export type HookMode = "video" | "acronym";

/**
 * E.1 (Deep Audit v2) — additive contentDoc on mnemonic sections.
 *
 * `content` is the legacy raw HTML string (still consumed by the workshop
 * UI / test runner). `contentDoc` is the canonical editor-v4 AST that
 * matches `Card.sections` and `Source.contentDoc`. Writers should dual-
 * populate both for one release cycle so backups round-trip cleanly while
 * the UI migrates off the HTML string.
 *
 * @deprecated `content` will become read-only once the workshop UI migrates
 * to `EditorView`. Read through `getMnemonicSectionHtml(s)` (TODO) so the
 * eventual flip is a one-line change.
 */
export interface MnemonicSection {
  title: string;
  /** @deprecated use contentDoc once the UI migrates; kept for back-compat. */
  content: string;
  contentDoc?: EditorDoc;
}

export interface MnemonicCard {
  id: string;
  originalCardId: string;  // reference to original card
  question: string;
  sections: MnemonicSection[];
  categoryId: string;
  subcategoryId?: string;
  tags?: string[];          // cloned from original card
  hookType: HookType;       // auto-detected or manual
  hookMode: HookMode;       // which hook input to use: video or acronym
  mnemonicVideo: string;    // user's mental video description
  acronym: string;          // user's acronym/mnemonic aid
  mnemonicStatus: MnemonicStatus;
  createdAt: number;
  // Isolated stats
  testCount: number;
  successCount: number;
  failCount: number;
  lastTested: number | null;
}

export interface MnemonicTestLogEntry {
  timestamp: number;
  cardId: string;
  success: boolean;
}
