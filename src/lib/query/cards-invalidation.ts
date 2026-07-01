/**

 * Direct TanStack invalidation for card queries (TD-ARCH-3/5).

 */

import type { QueryClient } from "@tanstack/react-query";

import type { CardsChangedScope } from "@/lib/query/cache-scope-types";

import { queryClient } from "./client";

import { queryKeys } from "./keys";



/** Scopes that map to concrete query keys (not prefix-wide all/derived). */

type CardsKeyedScope = Exclude<

  CardsChangedScope,

  { kind: "all" } | { kind: "derived" }

>;



export function keysForCardsScope(

  scope: CardsKeyedScope,

): readonly (readonly string[])[] {

  switch (scope.kind) {

    case "category": {

      const { categoryId } = scope;

      return [

        queryKeys.cards.all(),

        queryKeys.cards.byCategory(categoryId),

        queryKeys.cards._subcatRoot(categoryId),

        queryKeys.cards._chapRoot(categoryId),

        queryKeys.cards._typeRoot(categoryId),

        queryKeys.cards.countByCategory(categoryId),

        queryKeys.cards.countAll(),

      ];

    }

    case "subcategory": {

      const { categoryId, subcategoryId } = scope;

      return [

        queryKeys.cards.all(),

        queryKeys.cards.byCategory(categoryId),

        queryKeys.cards.bySubcategory(categoryId, subcategoryId),

        queryKeys.cards.countByCategory(categoryId),

        queryKeys.cards.countAll(),

      ];

    }

    case "chapter": {

      const { categoryId, chapterId } = scope;

      return [

        queryKeys.cards.all(),

        queryKeys.cards.byCategory(categoryId),

        queryKeys.cards.byChapter(categoryId, chapterId),

        queryKeys.cards.countByCategory(categoryId),

        queryKeys.cards.countAll(),

      ];

    }

    case "source":

      return [

        queryKeys.cards.all(),

        queryKeys.cards.bySource(scope.sourceId),

        queryKeys.cards.countAll(),

      ];

  }

}



function isDerivedCardsQueryKey(key: readonly unknown[]): boolean {

  if (!Array.isArray(key) || key[0] !== "cards") return false;

  if (key.length === 2 && key[1] === "all") return false;

  if (key.length === 3 && key[1] === "count" && key[2] === "all") return false;

  return true;

}



function flushScopes(qc: QueryClient, scopes: readonly CardsChangedScope[]): void {

  const pendingPrefix = scopes.some((s) => s.kind === "all");

  const pendingDerived =

    !pendingPrefix && scopes.some((s) => s.kind === "derived");

  const pendingKeys = new Set<string>();



  if (!pendingPrefix && !pendingDerived) {

    for (const scope of scopes) {

      if (scope.kind === "all" || scope.kind === "derived") continue;

      for (const key of keysForCardsScope(scope)) {

        pendingKeys.add(JSON.stringify(key));

      }

    }

  }



  if (pendingPrefix) {

    void qc.invalidateQueries({ queryKey: ["cards"] });

    return;

  }

  if (pendingDerived) {

    void qc.invalidateQueries({

      queryKey: queryKeys.cards.root,

      predicate: (query) => isDerivedCardsQueryKey(query.queryKey),

    });

    return;

  }

  for (const serialized of pendingKeys) {

    void qc.invalidateQueries({

      queryKey: JSON.parse(serialized) as readonly unknown[],

    });

  }

}



/** Immediate scoped card cache invalidation. */

export function invalidateCardsCacheScopes(

  scopes: CardsChangedScope | readonly CardsChangedScope[],

  qc: QueryClient = queryClient,

): void {

  const list = Array.isArray(scopes) ? scopes : [scopes];

  if (list.length === 0) return;

  flushScopes(qc, list);

}


