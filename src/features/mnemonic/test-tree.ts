/**
 * Pure derivations for the mnemonic test selector. No React, no I/O.
 */
import type { MnemonicCard, HookType } from "./mnemonic-storage";
import type { CategoryRecord } from "@/lib/db-schema";

export interface TestFilter {
  category: string | null;
  subcategory: string | null;
  hookType: HookType | null;
}

export function buildCategoryTree(cards: MnemonicCard[]): Record<string, Set<string>> {
  const tree: Record<string, Set<string>> = {};
  for (const c of cards) {
    if (!tree[c.categoryId]) tree[c.categoryId] = new Set();
    if (c.subcategoryId) tree[c.categoryId].add(c.subcategoryId);
  }
  return tree;
}

export function buildHookTypeCounts(cards: MnemonicCard[]): Record<HookType, number> {
  const counts: Record<HookType, number> = { rokovi: 0, nabrajanja: 0, ostalo: 0 };
  for (const c of cards) counts[c.hookType] = (counts[c.hookType] || 0) + 1;
  return counts;
}

export function filterTestable(cards: MnemonicCard[], filter: TestFilter): MnemonicCard[] {
  let result = cards;
  if (filter.category) result = result.filter(c => c.categoryId === filter.category);
  if (filter.subcategory) result = result.filter(c => c.subcategoryId === filter.subcategory);
  if (filter.hookType) result = result.filter(c => c.hookType === filter.hookType);
  return result;
}

/** Unbiased Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(arr: ReadonlyArray<T>): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildUuidToName(records: CategoryRecord[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of records) {
    map[r.id] = r.name;
    for (const s of (r.subcategories || [])) map[s.id] = s.name;
  }
  return map;
}
