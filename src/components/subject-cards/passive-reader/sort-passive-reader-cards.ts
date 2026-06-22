import type { Card } from "@/lib/spaced-repetition";

/** Stable reader order — tie-break on id because SQL category queries have no ORDER BY. */
export function sortPassiveReaderCards(a: Card, b: Card): number {
  return (
    (a.createdAt ?? 0) - (b.createdAt ?? 0)
    || (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0)
    || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    || a.id.localeCompare(b.id)
  );
}
