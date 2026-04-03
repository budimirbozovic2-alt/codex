// ─── Category Service Layer ("Oficir za vezu") ─────────
// Centralni servis za optimističke category operacije i UUID lookup helpere.
// UI komponente NIKADA ne pišu direktno u IDB — sve ide kroz ovaj sloj.

import { idbLoadCategories, idbSaveCategories, type CategoryRecord, type SubcategoryNode, type ChapterNode } from "@/lib/db";
import { toast } from "sonner";

// ─── Optimistic update with rollback ───────────────────
export async function optimisticCategoryUpdate(
  setCategoryRecords: React.Dispatch<React.SetStateAction<CategoryRecord[]>>,
  updater: (prev: CategoryRecord[]) => CategoryRecord[],
  label: string
) {
  let rollbackSnapshot: CategoryRecord[] | null = null;
  setCategoryRecords(prev => {
    rollbackSnapshot = prev;
    return updater(prev);
  });
  try {
    const current = await idbLoadCategories();
    const updated = updater(current);
    await idbSaveCategories(updated);
  } catch (e) {
    console.error(`[${label}] IDB persist failed, rolling back`, e);
    if (rollbackSnapshot) setCategoryRecords(rollbackSnapshot);
    toast({ title: "Greška", description: "Promjena nije sačuvana.", variant: "destructive" });
  }
}

// ─── UUID Lookup Helpers ────────────────────────────────

export function findSubcategoryById(records: CategoryRecord[], subId: string): SubcategoryNode | null {
  if (!subId) return null;
  for (const r of records) {
    for (const n of (r.subcategories || [])) {
      if (n.id === subId) return n;
    }
  }
  return null;
}

export function findChapterById(records: CategoryRecord[], chapId: string): ChapterNode | null {
  if (!chapId) return null;
  for (const r of records) {
    for (const n of (r.subcategories || [])) {
      for (const ch of (n.chapters || [])) {
        if (typeof ch === "object" && ch.id === chapId) return ch;
      }
    }
  }
  return null;
}

export function findSubcategoryByName(records: CategoryRecord[], catId: string, name: string): SubcategoryNode | null {
  if (!name) return null;
  const rec = records.find(r => r.id === catId);
  if (!rec) return null;
  return (rec.subcategories || []).find(n => n.name === name) || null;
}

export function findChapterByName(records: CategoryRecord[], catId: string, subId: string, name: string): ChapterNode | null {
  if (!name) return null;
  const rec = records.find(r => r.id === catId);
  if (!rec) return null;
  for (const n of (rec.subcategories || [])) {
    if (n.id === subId || (!subId && n.name)) {
      for (const ch of (n.chapters || [])) {
        if (typeof ch === "object" && ch.name === name) return ch;
        if (typeof ch === "string" && ch === name) return null; // legacy string, no UUID yet
      }
    }
  }
  return null;
}

export function getSubcategoryName(records: CategoryRecord[], subId: string): string {
  const node = findSubcategoryById(records, subId);
  return node?.name || "";
}

export function getChapterName(records: CategoryRecord[], chapId: string): string {
  const node = findChapterById(records, chapId);
  return node?.name || "";
}

/** Find the parent category ID for a given subcategory UUID */
export function findCategoryForSubcategory(records: CategoryRecord[], subId: string): string {
  if (!subId) return "";
  for (const r of records) {
    for (const n of (r.subcategories || [])) {
      if (n.id === subId) return r.id;
    }
  }
  return "";
}

/** Find the parent subcategory ID for a given chapter UUID */
export function findSubcategoryForChapter(records: CategoryRecord[], chapId: string): string {
  if (!chapId) return "";
  for (const r of records) {
    for (const n of (r.subcategories || [])) {
      for (const ch of (n.chapters || [])) {
        if (typeof ch === "object" && ch.id === chapId) return n.id;
      }
    }
  }
  return "";
}
