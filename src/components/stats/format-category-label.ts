/** Display name for a category id (UUID → human-readable subject name). */
export function formatCategoryLabel(
  categoryId: string,
  catNameMap: Record<string, string>,
  maxLen = 12,
): string {
  const name = catNameMap[categoryId] ?? categoryId;
  return name.length > maxLen ? `${name.slice(0, maxLen)}…` : name;
}
