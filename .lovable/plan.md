

# Zamjena useCardContext() granularnim hookovima

## Problem

`useCardContext()` spaja 4 konteksta u novi objekat pri svakom renderu. Svaka komponenta koja ga koristi re-renderuje se kad se promijeni **bilo koji** kontekst — poništavajući dekompoziciju na granularne kontekste.

## Pristup

Zamijeniti svaki poziv `useCardContext()` sa kombinacijom granularnih hookova (`useCardData`, `useCategoryData`, `useReviewData`, `useCardActions`), koristeći samo one koji su stvarno potrebni. Na kraju deprecirati `useCardContext`.

## Mapiranje potrošača (14 fajlova)

| Fajl | Trenutno koristi | Zamjena hookovima |
|------|-----------------|-------------------|
| `DashboardPage.tsx` | cards, stats, categoryStats, categories, subcategories, reviewLog, srSettings, ready | `useCardData` + `useCategoryData` + `useReviewData` |
| `LearnPage.tsx` | cards, categories, categoryRecords, subcategories, markRead, reviewSection, stats, reviewLog, addKeyPart, ready | `useCardData` + `useCategoryData` + `useReviewData` + `useCardActions` |
| `ReviewPage.tsx` | dueCards, cards, categoryRecords, reviewLog, subcategories, srSettings, reviewSection, logError, ready | `useCardData` + `useCategoryData` + `useReviewData` + `useCardActions` |
| `StatsPage.tsx` | cards, categories, categoryRecords, subcategories, categoryStats, reviewLog, srSettings, ready | `useCardData` + `useCategoryData` + `useReviewData` |
| `CreatePage.tsx` | categories, subcategories, categoryRecords, addCard, addFlashCard | `useCategoryData` + `useCardActions` |
| `EditPage.tsx` | categories, subcategories, categoryRecords, updateCard, splitCard | `useCategoryData` + `useCardActions` |
| `CategoriesPage.tsx` | categories, subcategories, cardCountByCategory, addCategory, renameCategory, deleteCategory, ready | `useCategoryData` + `useCardData` (ready) + `useCardActions` |
| `KnowledgeMapPage.tsx` | cards, categories, subcategories, reorderCategories, reorderSubcategories, ready | `useCardData` + `useCategoryData` + `useCardActions` |
| `PlannerPage.tsx` | cards, categories, categoryRecords, reviewLog, ready | `useCardData` + `useCategoryData` + `useReviewData` |
| `MetacognitivePage.tsx` | cards, categories, categoryRecords, reviewLog, srSettings, clearErrorLog, ready | `useCardData` + `useCategoryData` + `useReviewData` + `useCardActions` |
| `FrequentErrorsPage.tsx` | cards, categoryRecords, clearErrorLog, ready | `useCardData` + `useCategoryData` + `useCardActions` |
| `TopNav.tsx` | stats | `useCardData` |
| `MainLayout.tsx` (3 komponente) | cards; categories, importCards, addFlashCard | `useCardData` + `useCategoryData` + `useCardActions` |
| `SRSettingsPanel.tsx` | cards, categories, subcategories, cardCountByCategory, exportData, exportTemplate, importData, addCategory, renameCategory, deleteCategory | `useCardData` + `useCategoryData` + `useCardActions` |

## Promjene po fajlu

Svaki fajl:
1. Import zamjena: `useCardContext` → odgovarajući granularni hookovi
2. Destrukturiranje iz zasebnih hookova umjesto jednog poziva
3. Bez promjene ostatka koda

## AppContext.tsx

- Dodati `@deprecated` JSDoc komentar na `useCardContext`
- Zadržati funkciju za eventualne propuštene potrošače
- Ukloniti `useAppContext` (nekorišten osim u samom fajlu)

## Scope
- 15 fajlova, ~2-5 linija po fajlu
- Nema novih zavisnosti
- Nema promjene ponašanja — čist refaktoring
- Performans dobitak: komponente se re-renderuju samo kad se promijeni kontekst koji stvarno koriste

