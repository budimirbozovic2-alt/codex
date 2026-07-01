/**
 * Scoped `notifyCardsChanged` helpers — derive invalidation scope from
 * indexed card columns instead of defaulting to `{ kind: "all" }`.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { CardsChangedScope } from "@/lib/query/cache-scope-types";
import { runInTransaction } from "@/lib/persistence/sqlite/client";
import { invalidateCardsCacheScopes } from "@/lib/query/cards-invalidation";

export type CardScopeRef = {
  categoryId: string;
  subcategoryId?: string | null;
  chapterId?: string | null;
  sourceId?: string | null;
};

export function cardToScopeRef(
  card: Pick<Card, "categoryId" | "subcategoryId" | "chapterId" | "sourceId">,
): CardScopeRef {
  return {
    categoryId: card.categoryId,
    subcategoryId: card.subcategoryId,
    chapterId: card.chapterId,
    sourceId: card.sourceId,
  };
}

export function uniqueCategoryScopes(refs: readonly CardScopeRef[]): CardsChangedScope[] {
  const seen = new Set<string>();
  const out: CardsChangedScope[] = [];
  for (const ref of refs) {
    if (!ref.categoryId || seen.has(ref.categoryId)) continue;
    seen.add(ref.categoryId);
    out.push({ kind: "category", categoryId: ref.categoryId });
  }
  return out;
}

export function scopesForRefs(refs: readonly CardScopeRef[]): CardsChangedScope[] {
  const scopes = uniqueCategoryScopes(refs);
  const sourceIds = new Set<string>();
  for (const ref of refs) {
    if (ref.sourceId) sourceIds.add(ref.sourceId);
  }
  for (const sourceId of sourceIds) {
    scopes.push({ kind: "source", sourceId });
  }
  return scopes;
}

export function scopesForTransition(
  before: CardScopeRef,
  after: CardScopeRef,
): CardsChangedScope[] {
  return scopesForRefs([before, after]);
}

function dedupeScopes(scopes: readonly CardsChangedScope[]): CardsChangedScope[] {
  const seen = new Set<string>();
  const out: CardsChangedScope[] = [];
  for (const scope of scopes) {
    const key = JSON.stringify(scope);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(scope);
  }
  return out;
}

/** Emit scoped invalidations — direct TanStack flush (no bridge debounce). */
export function emitCardsChanged(scopes: CardsChangedScope | readonly CardsChangedScope[]): void {
  const list = dedupeScopes(Array.isArray(scopes) ? scopes : [scopes]);
  if (list.length === 0) {
    invalidateCardsCacheScopes({ kind: "all" });
    return;
  }
  invalidateCardsCacheScopes(list);
}

export function emitCardsChangedForRefs(refs: readonly CardScopeRef[]): void {
  emitCardsChanged(scopesForRefs(refs));
}

export function emitCardsChangedForCard(
  card: Pick<Card, "categoryId" | "subcategoryId" | "chapterId" | "sourceId">,
): void {
  emitCardsChangedForRefs([cardToScopeRef(card)]);
}

export function emitCardsChangedForTransition(
  before: Pick<Card, "categoryId" | "subcategoryId" | "chapterId" | "sourceId">,
  after: Pick<Card, "categoryId" | "subcategoryId" | "chapterId" | "sourceId">,
): void {
  emitCardsChanged(
    scopesForTransition(cardToScopeRef(before), cardToScopeRef(after)),
  );
}

export function emitCardsChangedForCategoryIds(categoryIds: readonly string[]): void {
  const scopes = uniqueCategoryScopes(
    categoryIds.filter(Boolean).map((categoryId) => ({ categoryId })),
  );
  if (scopes.length === 0) {
    invalidateCardsCacheScopes({ kind: "all" });
    return;
  }
  emitCardsChanged(scopes);
}

const ID_CHUNK = 200;

/** Load indexed scope columns for a set of card ids (write-path helper). */
export async function fetchCardScopeRefs(
  ids: readonly string[],
): Promise<CardScopeRef[]> {
  if (ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const out: CardScopeRef[] = [];
  await runInTransaction(async (tx) => {
    for (let i = 0; i < unique.length; i += ID_CHUNK) {
      const slice = unique.slice(i, i + ID_CHUNK);
      const placeholders = slice.map(() => "?").join(",");
      const rows = await tx.all<CardScopeRef>(
        `SELECT categoryId, subcategoryId, chapterId, sourceId
           FROM cards WHERE id IN (${placeholders})`,
        slice,
      );
      out.push(...rows);
    }
  });
  return out;
}

export function emitAfterCardWrite(
  before: Pick<Card, "categoryId" | "subcategoryId" | "chapterId" | "sourceId"> | null,
  after: Pick<Card, "categoryId" | "subcategoryId" | "chapterId" | "sourceId">,
): void {
  if (
    before &&
    (before.categoryId !== after.categoryId || before.sourceId !== after.sourceId)
  ) {
    emitCardsChangedForTransition(before, after);
  } else {
    emitCardsChangedForCard(after);
  }
}
