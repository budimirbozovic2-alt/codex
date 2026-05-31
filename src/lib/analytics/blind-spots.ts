// Thin adapter — pulls calibration snapshot from main-thread storage and
// delegates to `_pure/blind-spots.ts`.
//
// NOTE: `calcWeakHooks` moved to `@/domains/mnemonic` because it WRITES
// to mnemonic IDB (tags "slaba-kuka") and therefore belongs in the
// mnemonic bounded context, not in the OLAP layer. Re-exported here as
// a deprecation shim — new code MUST import from `@/domains/mnemonic`.
import { Card } from "../spaced-repetition";
import { loadCalibration } from "../metacognitive-storage";
import { calcBlindSpots as calcBlindSpotsPure, type BlindSpot } from "./_pure/blind-spots";

export type { BlindSpot };

export function calcBlindSpots(cards: Card[]): BlindSpot[] {
  return calcBlindSpotsPure(cards, loadCalibration());
}

/** @deprecated Import from `@/domains/mnemonic` instead. */
export { calcWeakHooks, type WeakHook } from "@/domains/mnemonic";
