// Isolated mnemonic cards storage — completely separate from main FSRS system

export type MnemonicStatus = "new" | "in-workshop" | "ready";

export interface MnemonicCard {
  id: string;
  originalCardId: string;  // reference to original card
  question: string;
  sections: { title: string; content: string }[];
  category: string;
  subcategory?: string;
  mnemonicVideo: string;   // user's mental video description
  acronym: string;         // user's acronym/mnemonic aid
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

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Major System
export function loadMajorSystem(): Record<number, string> {
  return loadFromStorage(MAJOR_SYSTEM_KEY, DEFAULT_MAJOR_SYSTEM);
}

export function saveMajorSystem(system: Record<number, string>) {
  saveToStorage(MAJOR_SYSTEM_KEY, system);
}

// Mnemonic Cards
export function loadMnemonicCards(): MnemonicCard[] {
  return loadFromStorage(MNEMONIC_CARDS_KEY, []);
}

export function saveMnemonicCards(cards: MnemonicCard[]) {
  saveToStorage(MNEMONIC_CARDS_KEY, cards);
}

export function createMnemonicCard(
  originalCardId: string,
  question: string,
  sections: { title: string; content: string }[],
  category: string,
  subcategory?: string,
): MnemonicCard {
  return {
    id: crypto.randomUUID(),
    originalCardId,
    question,
    sections,
    category,
    subcategory,
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
export function loadMnemonicTestLog(): MnemonicTestLogEntry[] {
  return loadFromStorage(MNEMONIC_TEST_LOG_KEY, []);
}

export function saveMnemonicTestLog(log: MnemonicTestLogEntry[]) {
  saveToStorage(MNEMONIC_TEST_LOG_KEY, log);
}

export function addMnemonicTestEntry(entry: MnemonicTestLogEntry) {
  const log = loadMnemonicTestLog();
  log.push(entry);
  saveMnemonicTestLog(log);
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
