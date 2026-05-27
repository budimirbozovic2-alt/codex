// Major System I/O + number → peg resolution.
// PR-9 A1b P1.6: delegates all DB I/O to the SQLite-primary repository.
// Dexie writes happen via the repo's mirror path during soak.

import { logger } from "@/lib/logger";
import { listAllPegs, bulkPutPegs } from "@/lib/db/queries/major-system";
import { DEFAULT_MAJOR_SYSTEM, JOKER_LOCATIONS } from "./constants";

export async function loadMajorSystem(): Promise<Record<number, string>> {
  try {
    const records = await listAllPegs();
    if (records.length === 0) return DEFAULT_MAJOR_SYSTEM;
    const system: Record<number, string> = {};
    records.forEach(r => { system[r.id] = r.peg; });
    return system;
  } catch (err) {
    logger.error("[mnemonic-storage] loadMajorSystem failed", err);
    return DEFAULT_MAJOR_SYSTEM;
  }
}

export async function saveMajorSystem(system: Record<number, string>): Promise<void> {
  try {
    const records = Object.entries(system).map(([id, peg]) => ({ id: parseInt(id, 10), peg }));
    await bulkPutPegs(records);
  } catch (err) {
    logger.error("[mnemonic-storage] saveMajorSystem failed", err);
  }
}

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
