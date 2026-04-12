

# Memoizacija `highlightKeyParts` poziva

## Problem
`highlightKeyParts` kreira RegExp objekte i poziva DOMPurify sanitizaciju na svakom renderu. U sesijama učenja/konsolidacije, ovo se poziva nepotrebno kada se `content` i `keyParts` nisu promijenili (npr. pri promjeni `showAnswer`, `confidence`, timer state-a).

## Rješenje
Dodati `useMemo` wrapper oko svakog `highlightKeyParts` poziva u 4 komponente. Zavisnosti: `[content, keyParts]`.

## Izmjene po fajlu

### 1. `src/components/review/ReviewCard.tsx`
- 1 poziv (linija 285) — memoizirati sa `useMemo(() => highlightKeyParts(section.content, card.keyParts), [section.content, card.keyParts])`

### 2. `src/components/learn/StudyModeFree.tsx`
- 2 poziva (linije 90, 112) — ovi su unutar `.map()` i conditional renderinga. Kreirati helper komponentu `HighlightedContent` koja interno koristi `useMemo`, ili memoizirati na nivou kartice (jedan `useMemo` za sve sekcije koji vraća `Map<sectionId, html>`).

### 3. `src/components/learn/StudyModeRecall.tsx`
- 2 poziva (linije 102, 133) — isti pristup: memoizirati po sekciji.

### 4. `src/components/learn/StudyModeChain.tsx`
- 2 poziva (linije 150, 178) — memoizirati po aktivnom chain indeksu.

## Implementacijski pristup
Kreirati malu helper komponentu `MemoizedHighlight` u `src/lib/highlight-key-parts.ts`:

```tsx
export function useHighlightedContent(content: string, keyParts?: string[]): string {
  return useMemo(() => highlightKeyParts(content, keyParts), [content, keyParts]);
}
```

Svaki poziv `highlightKeyParts` u renderingu zamijeniti sa `useHighlightedContent` hook-om ili `useMemo` wraperom direktno. Za pozive unutar `.map()` loop-ova, koristiti malu `<HighlightedSection>` komponentu koja enkapsulira `useMemo`.

## Scope
- 5 fajlova (4 komponente + `highlight-key-parts.ts`)
- Bez funkcionalnih promjena

