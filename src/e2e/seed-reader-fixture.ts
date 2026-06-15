import { htmlToDoc } from "@/lib/editor-v4";
import type { CategoryRecord, Source } from "@/lib/db-types";
import { bulkPutCategories } from "@/lib/db/queries/categories";
import { saveSource, loadSourcesByCategory } from "@/domains/sources/sources-storage";
import {
  getCategoryStoreRecords,
  setCategoryStoreRecords,
} from "@/store/useCategoryStore";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";

export const E2E_CATEGORY_ID = "e2e-cat-reader";
export const E2E_SOURCE_ID = "e2e-src-reader";
export const E2E_SKRIPTA_SOURCE_ID = "e2e-src-skripta";
export const E2E_SOURCE_TITLE = "E2E Test Izvor";
export const E2E_SKRIPTA_TITLE = "E2E Test Skripta";

const E2E_CATEGORY: CategoryRecord = {
  id: E2E_CATEGORY_ID,
  name: "E2E Reader Kategorija",
  sortOrder: 9999,
  subcategories: [],
};

function buildE2ESource(): Source {
  const now = Date.now();
  return {
    id: E2E_SOURCE_ID,
    categoryId: E2E_CATEGORY_ID,
    title: E2E_SOURCE_TITLE,
    date: new Date(now).toISOString().slice(0, 10),
    contentDoc: htmlToDoc(
      "<p>E2E početni tekst za autosave i bubble menu test.</p>",
    ),
    outline: [],
    articles: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceKind: "propis",
  };
}

function buildE2ESkriptaSource(): Source {
  const now = Date.now();
  return {
    id: E2E_SKRIPTA_SOURCE_ID,
    categoryId: E2E_CATEGORY_ID,
    title: E2E_SKRIPTA_TITLE,
    date: new Date(now).toISOString().slice(0, 10),
    contentDoc: htmlToDoc(
      "<p>Teorijski uvod o ugovornom pravu.</p><p>Član 1. Ovo je isječak zakonskog teksta za E2E test.</p>",
    ),
    outline: [],
    articles: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceKind: "skripta",
  };
}

/** Seed category + sources for Source Reader E2E smoke tests. */
export async function seedReaderFixture(): Promise<{
  categoryId: string;
  sourceId: string;
  skriptaSourceId: string;
}> {
  const withoutE2E = getCategoryStoreRecords().filter(
    (c) => c.id !== E2E_CATEGORY_ID,
  );
  setCategoryStoreRecords([...withoutE2E, E2E_CATEGORY]);
  await bulkPutCategories([E2E_CATEGORY]);

  const propisRes = await saveSource(buildE2ESource());
  if (!propisRes.ok) {
    throw new Error("E2E seed: saveSource (propis) failed");
  }

  const skriptaRes = await saveSource(buildE2ESkriptaSource());
  if (!skriptaRes.ok) {
    throw new Error("E2E seed: saveSource (skripta) failed");
  }

  const loaded = await loadSourcesByCategory(E2E_CATEGORY_ID);
  if (!loaded.some((s) => s.id === E2E_SOURCE_ID)) {
    throw new Error("E2E seed: propis source missing after save");
  }
  if (!loaded.some((s) => s.id === E2E_SKRIPTA_SOURCE_ID)) {
    throw new Error("E2E seed: skripta source missing after save");
  }

  queryClient.setQueryData(
    queryKeys.sources.byCategory(E2E_CATEGORY_ID),
    loaded,
  );
  await queryClient.invalidateQueries({
    queryKey: queryKeys.cards.masteryDistributionByCategory(E2E_CATEGORY_ID),
  });

  return {
    categoryId: E2E_CATEGORY_ID,
    sourceId: E2E_SOURCE_ID,
    skriptaSourceId: E2E_SKRIPTA_SOURCE_ID,
  };
}
