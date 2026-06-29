/**

 * Direct TanStack invalidation for category queries (TD-ARCH-3/5).

 */

import { queryClient } from "./client";

import { queryKeys } from "./keys";



export function invalidateCategoriesCache(

  qc = queryClient,

): void {

  void qc.invalidateQueries({ queryKey: queryKeys.categories.root });

}


