

# Fix: Strip Structural Headings from Auto-Split Card Content

## Problem
Both split engines (`auto-split-engine.ts` and `selection-split-engine.ts`) already filter `isHeading` (H1-H3 tags) and markdown-style headings, but they do NOT filter **structural legal headings** that appear as regular `<p>` elements — lines like `"GLAVA PRVA"`, `"DIO DRUGI"`, `"POGLAVLJE III"`, `"ODJELJAK 2"`. These get included in card body content as noise.

## Solution
Add a shared `isStructuralLine()` utility that detects these lines, then apply it as an additional filter in both content-collection loops.

### New: `isStructuralLine` helper (in each engine, or shared)
```ts
const STRUCTURAL_KEYWORDS = /^\s*(DIO|GLAVA|POGLAVLJE|ODJELJAK|CZĘŚĆ|TYTUŁ)\b/i;

function isStructuralLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 120) return false;
  // Purely uppercase lines ≤80 chars (e.g. "GLAVA PRVA", "OPŠTE ODREDBE")
  if (trimmed.length <= 80 && trimmed === trimmed.toUpperCase() && /[A-ZČĆŽŠĐ]/.test(trimmed)) return true;
  // Lines starting with structural keywords
  if (STRUCTURAL_KEYWORDS.test(trimmed)) return true;
  return false;
}
```

### File 1: `auto-split-engine.ts` — lines 140-144
Current content collection loop:
```ts
for (let j = i + 1; j < nextBoundary; j++) {
  if (lines[j].text && !lines[j].isHeading) {
```
Change to:
```ts
for (let j = i + 1; j < nextBoundary; j++) {
  if (lines[j].text && !lines[j].isHeading && !isStructuralLine(lines[j].text)) {
```

### File 2: `selection-split-engine.ts` — lines 115-117
Current content collection loop:
```ts
for (let j = lineIndex + 1; j < contentEnd; j++) {
  if (lines[j].trim() && !HEADING_LINE_REGEX.test(lines[j])) contentLines.push(lines[j]);
```
Change to:
```ts
for (let j = lineIndex + 1; j < contentEnd; j++) {
  if (lines[j].trim() && !HEADING_LINE_REGEX.test(lines[j]) && !isStructuralLine(lines[j])) contentLines.push(lines[j]);
```

## Files modified
| File | Change |
|------|--------|
| `src/lib/auto-split-engine.ts` | Add `isStructuralLine` function + filter in content loop |
| `src/lib/selection-split-engine.ts` | Add `isStructuralLine` function + filter in content loop |

## What stays untouched
- Title detection logic — structural lines above `Član` can still be picked up as titles if appropriate
- `essayName` / metadata — unchanged
- `plainSnippet` — will also be cleaned (structural lines won't appear)
- FSRS/SM-2 logic — not involved
- `heading-promotion.ts` — not modified

