// Public + internal types for the mnemonic-storage module.
// See ./index.ts for the public barrel.

export type MnemonicStatus = "new" | "in-workshop" | "ready";
export type HookType = "rokovi" | "nabrajanja" | "ostalo";
export type HookMode = "video" | "acronym";

export interface MnemonicCard {
  id: string;
  originalCardId: string;  // reference to original card
  question: string;
  sections: { title: string; content: string }[];
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
