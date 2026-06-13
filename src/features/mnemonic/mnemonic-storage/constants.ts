// Static data: Major System default pegs and joker locations.

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
