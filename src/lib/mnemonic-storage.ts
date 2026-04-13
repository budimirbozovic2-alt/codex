// Isolated mnemonic cards storage — completely separate from main FSRS system

import { db } from "./db";

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

// Major System pegs (0-100)
const MAJOR_SYSTEM_KEY = "sr-major-system";
const MNEMONIC_CARDS_KEY = "sr-mnemonic-cards";
const MNEMONIC_TEST_LOG_KEY = "sr-mnemonic-test-log";

export const DEFAULT_MAJOR_SYSTEM: Record<number, string> = {
  0: "OSA", 1: "DUH", 2: "NOA", 3: "MAO", 4: "RA", 5: "LI", 6: "ČAJ", 7: "OKO", 8: "UVO", 9: "PAJA",
  10: "TAZ", 11: "TITO", 12: "DUNJA", 13: "TOM", 14: "TOR", 15: "DALI", 16: "TUŠ", 17: "DUGA", 18: "DIV", 19: "DUPE",
  20: "NOS", 21: "NODI", 22: "NINA", 23: "NAMI", 24: "NAR", 25: "ENEL", 26: "NOŽ", 27: "NOGA", 28: "NJIVA", 29: "NAPA",
  30: "MESO", 31: "MED", 32: "MUNJA", 33: "MUMI", 34: "MORE", 35: "MILO", 36: "MAČ", 37: "MAJK", 38: "MUVA", 39: "MOP",
  40: "ROS", 41: "RODA", 42: "RON", 43: "RUM", 44: "AURORA", 45: "RALO", 46: "RUŽA", 47: "RAK", 48: "RAF", 49: "REP",
  50: "LESI", 51: "LED", 52: "LANE", 53: "LAMA", 54: "LARA", 55: "LULA", 56: "LIŠAJ", 57: "LOKI", 58: "LUFI", 59: "LUPA",
  60: "ŽICA", 61: "ŠTIT", 62: "ŠINA", 63: "ŠUMA", 64: "ŽIR", 65: "ŠAL", 66: "ČAŠA", 67: "ŠAKA", 68: "ŠIVA", 69: "ŠAPA",
  70: "KEZ", 71: "KADA", 72: "GON", 73: "GUMA", 74: "KORA", 75: "KELJ", 76: "KUĆA", 77: "GOKU", 78: "KAFA", 79: "KAPA",
  80: "FEZ", 81: "VODA", 82: "VINO", 83: "VIME", 84: "FERI", 85: "VILE", 86: "FIĆA", 87: "VAGA", 88: "FIFI", 89: "FAP",
  90: "PEZ", 91: "PITA", 92: "PONI", 93: "PUMA", 94: "PERO", 95: "PELE", 96: "BIČ", 97: "PAUK", 98: "PIVO", 99: "BEBA",
  100: "TASOS",
};


/**
 * Migration: Move mnemonics from localStorage to IndexedDB (Transactional)
 * Ensures all-or-nothing consistency.
 */
export async function migrateMnemonicsFromLocalStorageToIDB(): Promise<number> {
  const MIGRATED_FLAG = "mnemonics-migrated-v10";
  if (localStorage.getItem(MIGRATED_FLAG) === "true") return 0;

  try {
    const rawCards = localStorage.getItem(MNEMONIC_CARDS_KEY);
    const rawMajor = localStorage.getItem(MAJOR_SYSTEM_KEY);
    const rawLog = localStorage.getItem(MNEMONIC_TEST_LOG_KEY);
    
    const cards = rawCards ? JSON.parse(rawCards) : [];
    const majorSystem = rawMajor ? JSON.parse(rawMajor) : {};
    const testLog = rawLog ? JSON.parse(rawLog) : [];

    if (cards.length === 0 && Object.keys(majorSystem).length === 0 && testLog.length === 0) {
      localStorage.setItem(MIGRATED_FLAG, "true");
      return 0;
    }

    // Transform cards
    const transformedCards: MnemonicCard[] = cards.map((c: any) => ({
      ...c,
      categoryId: c.categoryId || c.category || "",
      subcategoryId: c.subcategoryId || crypto.randomUUID(),
      hookType: c.hookType || "ostalo",
      hookMode: c.hookMode || (c.mnemonicVideo ? "video" : "acronym"),
      tags: c.tags || [],
    }));

    // Transform major system records to match schema: { id: number; peg: string }
    const majorRecords = Object.entries(majorSystem).map(([key, value]) => ({
      id: parseInt(key, 10),
      peg: value as string
    }));

    // ALL-OR-NOTHING TRANSAKCIJA
    await db.transaction('rw', [db.mnemonics, db.majorSystem, db.mnemonicTestLog], async () => {
      if (transformedCards.length > 0) {
        await db.mnemonics.bulkPut(transformedCards);
      }
      if (majorRecords.length > 0) {
        await db.majorSystem.bulkPut(majorRecords);
      }
      if (testLog.length > 0) {
        await db.mnemonicTestLog.bulkAdd(testLog);
      }
    });

    // ZAVRŠNI COMMIT SIGNAL (Tek kada je IDB transakcija 100% uspješna)
    localStorage.setItem(MIGRATED_FLAG, "true");
    
    // Bezbjedno brisanje starih podataka
    localStorage.removeItem(MNEMONIC_CARDS_KEY);
    localStorage.removeItem(MAJOR_SYSTEM_KEY);
    localStorage.removeItem(MNEMONIC_TEST_LOG_KEY);

    if (import.meta.env.DEV) console.log(`[Migracija] Uspješno prebačeno ${transformedCards.length} mnemonika u IDB.`);
    return transformedCards.length;

  } catch (error) {
    console.error("[Migracija KRITIČNO] Transakcija propala, podaci u IDB poništeni. LocalStorage ostaje netaknut.", error);
    return 0;
  }
}

// Major System
export async function loadMajorSystem(): Promise<Record<number, string>> {
  try {
    const records = await db.majorSystem.toArray();
    if (records.length === 0) return DEFAULT_MAJOR_SYSTEM;
    const system: Record<number, string> = {};
    records.forEach(r => { system[r.id] = r.peg; });
    return system;
  } catch (err) {
    console.error("[mnemonic-storage] loadMajorSystem failed", err);
    return DEFAULT_MAJOR_SYSTEM;
  }
}

export async function saveMajorSystem(system: Record<number, string>): Promise<void> {
  try {
    const records = Object.entries(system).map(([id, peg]) => ({ id: parseInt(id, 10), peg }));
    await db.majorSystem.bulkPut(records);
  } catch (err) {
    console.error("[mnemonic-storage] saveMajorSystem failed", err);
  }
}

// Auto-detect hook type from content
export function detectHookType(sections: { content: string }[]): HookType {
  const allContent = sections.map(s => s.content).join(" ");
  const text = allContent.replace(/<[^>]*>/g, " ");
  // Check for deadlines/numbers patterns (rok, dan, mjesec, godina + numbers)
  const deadlinePattern = /\b(rok|dana|dan|mjesec|godin|Year|frist|deadline|\d+\s*(dana|dan|mjeseci|godina|sati|h))\b/i;
  if (deadlinePattern.test(text)) return "rokovi";
  // Check for enumerations
  const enumItems = detectEnumerationItems(allContent);
  if (enumItems.length >= 2) return "nabrajanja";
  return "ostalo";
}

// Mnemonic Cards
export async function loadMnemonicCards(): Promise<MnemonicCard[]> {
  try {
    return await db.mnemonics.toArray();
  } catch (err) {
    console.error("[mnemonic-storage] loadMnemonicCards failed", err);
    return [];
  }
}

export async function saveMnemonicCards(cards: MnemonicCard[]): Promise<void> {
  try {
    await db.mnemonics.bulkPut(cards);
  } catch (err) {
    console.error("[mnemonic-storage] saveMnemonicCards failed", err);
  }
}

export async function deleteMnemonicCard(id: string): Promise<void> {
  try {
    await db.mnemonics.delete(id);
  } catch (err) {
    console.error("[mnemonic-storage] deleteMnemonicCard failed", err);
  }
}

export function createMnemonicCardFromSelection(
  originalCardId: string,
  question: string,
  selectedText: string,
  categoryId: string,
  subcategoryId?: string,
  tags?: string[],
): MnemonicCard {
  return {
    id: crypto.randomUUID(),
    originalCardId,
    question,
    sections: [{ title: "Isječak", content: selectedText }],
    categoryId,
    subcategoryId,
    tags: tags || [],
    hookType: detectHookType([{ content: selectedText }]),
    hookMode: "video",
    mnemonicVideo: "",
    acronym: "",
    mnemonicStatus: "new",
    createdAt: Date.now(),
    testCount: 0,
    successCount: 0,
    failCount: 0,
    lastTested: null,
  };
}

export function createMnemonicCard(
  originalCardId: string,
  question: string,
  sections: { title: string; content: string }[],
  categoryId: string,
  subcategoryId?: string,
  tags?: string[],
): MnemonicCard {
  return {
    id: crypto.randomUUID(),
    originalCardId,
    question,
    sections,
    categoryId,
    subcategoryId,
    tags: tags || [],
    hookType: detectHookType(sections),
    hookMode: "video",
    mnemonicVideo: "",
    acronym: "",
    mnemonicStatus: "new",
    createdAt: Date.now(),
    testCount: 0,
    successCount: 0,
    failCount: 0,
    lastTested: null,
  };
}

// Mnemonic Test Log (isolated)
export async function loadMnemonicTestLog(): Promise<MnemonicTestLogEntry[]> {
  try {
    return await db.mnemonicTestLog.toArray();
  } catch (err) {
    console.error("[mnemonic-storage] loadMnemonicTestLog failed", err);
    return [];
  }
}

export async function addMnemonicTestEntry(entry: MnemonicTestLogEntry): Promise<void> {
  try {
    await db.mnemonicTestLog.add(entry);
  } catch (err) {
    console.error("[mnemonic-storage] addMnemonicTestEntry failed", err);
  }
}

// Stats (isolated from main dashboard)
export function getMnemonicStats(cards: MnemonicCard[]) {
  const total = cards.length;
  const newCount = cards.filter(c => c.mnemonicStatus === "new").length;
  const workshopCount = cards.filter(c => c.mnemonicStatus === "in-workshop").length;
  const readyCount = cards.filter(c => c.mnemonicStatus === "ready").length;
  const tested = cards.filter(c => c.testCount > 0);
  const avgSuccess = tested.length > 0
    ? Math.round(tested.reduce((s, c) => s + (c.successCount / c.testCount) * 100, 0) / tested.length)
    : 0;
  return { total, newCount, workshopCount, readyCount, avgSuccess };
}

// Joker locations for numbers > 100
export const JOKER_LOCATIONS: Record<number, string> = {
  1: "Bazen",      // 100-199
  2: "Svemir",     // 200-299
  3: "Stadion",    // 300-399
  4: "Piramida",   // 400-499
  5: "Podmornica", // 500-599
  6: "Vulkan",     // 600-699
  7: "Zamak",      // 700-799
  8: "Džungla",    // 800-899
  9: "Ledenjak",   // 900-999
};

// Resolve a number to Major System term + optional joker location
export function resolveNumber(num: number, majorSystem: Record<number, string>): { term: string; location?: string } {
  if (num <= 100) {
    return { term: majorSystem[num] || `(${num})` };
  }
  const hundreds = Math.floor(num / 100);
  const remainder = num % 100;
  const location = JOKER_LOCATIONS[hundreds] || `Lokacija ${hundreds}`;
  const term = majorSystem[remainder] || `(${remainder})`;
  return { term, location };
}

// Extract numbers from HTML/text content
export function extractNumbers(html: string): { number: number; context: string }[] {
  const text = html.replace(/<[^>]*>/g, "");
  const matches: { number: number; context: string }[] = [];
  const regex = /\b(\d+)\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (num >= 0 && num <= 9999) {
      const start = Math.max(0, match.index - 20);
      const end = Math.min(text.length, match.index + match[0].length + 20);
      const context = text.slice(start, end).trim();
      // Avoid duplicates
      if (!matches.some(m => m.number === num && m.context === context)) {
        matches.push({ number: num, context });
      }
    }
  }
  return matches;
}

// Detect enumeration items from HTML content
// Primary: actual <ul>/<ol> list items; Fallback: plain-text patterns
export function detectEnumerationItems(html: string): string[] {
  // Primary: HTML list items
  const liMatches = html.match(/<li[^>]*>(.*?)<\/li>/gi);
  if (liMatches && liMatches.length >= 2) {
    return liMatches.map(li => li.replace(/<[^>]*>/g, "").trim()).filter(Boolean);
  }
  // Fallback: plain-text patterns
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const numbered = text.match(/\d+[\.\)]\s*[^,;\d]+/g);
  if (numbered && numbered.length >= 2) {
    return numbered.map(s => s.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean);
  }
  const semicoloned = text.split(/;\s*/);
  if (semicoloned.length >= 3) {
    return semicoloned.map(s => s.trim()).filter(s => s.length > 1);
  }
  const commaItems = text.split(/,\s*/);
  if (commaItems.length >= 3 && commaItems.every(s => s.length < 60)) {
    return commaItems.map(s => s.trim()).filter(Boolean);
  }
  return [];
}