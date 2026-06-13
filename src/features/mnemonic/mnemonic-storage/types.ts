// Public + internal types for the mnemonic-storage module.
// See ./index.ts for the public barrel.

import type { EditorDoc } from "@/lib/editor-v4/types";

export type MnemonicStatus = "new" | "in-workshop" | "ready";
export type HookType = "rokovi" | "nabrajanja" | "ostalo";
type HookMode = "video" | "acronym";

/**
 * E.1 (Deep Audit v2) — contentDoc SSOT on mnemonic sections.
 *
 * `contentDoc` is the canonical editor-v4 AST. Legacy `content` HTML may
 * appear in old SQLite / backup payloads; repo decode synthesizes contentDoc
 * via `seedSectionDoc`. Writers must not populate `content` (P2.3+).
 */
export interface MnemonicSection {
  title: string;
  contentDoc: EditorDoc;
  /** @deprecated Legacy HTML — read boundary only; never written after P2.3. */
  content?: string;
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
