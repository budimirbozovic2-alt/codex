/**
 * Weak-hooks application service — loads data, runs pure domain compute,
 * persists tag updates. Keeps `domains/mnemonic` free of feature imports.
 */
import { calcWeakHooks, type WeakHook } from "@/domains/mnemonic";
import { loadLatency } from "@/domains/metacognition/metacognitive-storage";
import {
  loadMnemonicCards,
  saveMnemonicCards,
} from "@/domains/mnemonic";

export async function runWeakHooksAnalysis(): Promise<WeakHook[]> {
  const mnemonicCards = await loadMnemonicCards();
  const latencyLog = loadLatency();
  const { weakHooks, updatedCards } = calcWeakHooks(mnemonicCards, latencyLog);

  if (updatedCards) {
    await saveMnemonicCards(updatedCards);
  }

  return weakHooks;
}
