/** Brzi preset-i za rubriku očekivanih elemenata odgovora (pravosudni ispit). */

export const EXAMINER_CHECKLIST_MAX_ITEMS = 12;
export const EXAMINER_CHECKLIST_MAX_LEN = 80;

export const EXAMINER_CHECKLIST_PRESETS: readonly string[] = [
  "Pravni osnov (član)",
  "Subjektivni element",
  "Objektivni element",
  "Pravne posljedice",
  "Procesni rokovi",
  "Pretpostavke",
  "Pravna kvalifikacija",
  "Pravna primjena",
  "Tipični slučaj",
  "Atypični slučaj",
  "Pravna zaštita",
  "Zastarelost",
];

export function normalizeChecklistItem(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, EXAMINER_CHECKLIST_MAX_LEN);
}

export function normalizeChecklistItems(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = normalizeChecklistItem(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= EXAMINER_CHECKLIST_MAX_ITEMS) break;
  }
  return out;
}
