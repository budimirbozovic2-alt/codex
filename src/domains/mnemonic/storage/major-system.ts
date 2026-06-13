import { logger } from "@/lib/logger";
import { listAllPegs } from "@/lib/db/queries/major-system";
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
