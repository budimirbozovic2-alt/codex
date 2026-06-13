import type { EditorDoc } from "@/lib/editor-v4/types";

export type MnemonicStatus = "new" | "in-workshop" | "ready";
export type HookType = "rokovi" | "nabrajanja" | "ostalo";
export type HookMode = "video" | "acronym";

export interface MnemonicSection {
  title: string;
  contentDoc: EditorDoc;
}

export interface MnemonicCard {
  id: string;
  originalCardId: string;
  question: string;
  sections: MnemonicSection[];
  categoryId: string;
  subcategoryId?: string;
  tags?: string[];
  hookType: HookType;
  hookMode: HookMode;
  mnemonicVideo: string;
  acronym: string;
  mnemonicStatus: MnemonicStatus;
  createdAt: number;
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
