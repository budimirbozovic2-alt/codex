# R4 + R5 — Preostali God Components (UI + Logic monoliti)

Iz originalnog SoC audita završeni su R1 (`SourceEditor`), R2 (`CognitiveAnalytics`), R3 (`MnemonicWorkshop` + `SessionFilters`). Preostala dva propusta:

| Tag | Fajl | LOC | Tier | Glavni problem |
|---|---|---|---|---|
| **R4** | `src/features/docx-importer/DocxImporter.tsx` | 404 | 🔴 P0 | DOM parsing (`splitIntoSections`, `parseContent`) + state mašina + JSX wizard u jednom fajlu |
| **R5** | `src/views/SubjectDashboard.tsx` | 361 | 🟠 P1 | Bucketing `Map<id, Card[]>` + dvostruka mastery agregacija u `useMemo` blokovima usred view fajla |

---

## R4 — `DocxImporter.tsx` (P0)

### Trenutno stanje
- `splitIntoSections` (50 lin) i `parseContent` (50 lin) su pure DOM traversal funkcije zarobljene kao `useCallback` u UI fajlu — netestabilne bez JSDOM-a + render-a.
- Wizard state mašina (`step: "upload" | "configure" | "preview"`), `mammoth` dynamic import, sanitizacija i `handleImport` su međusobno isprepleteni.
- 12+ `useState` polja za split mode/heading/delimiter za pitanja i sekcije.

### Target arhitektura
```text
DocxImporter.tsx (~180 LOC, čist presenter — 3 koraka × Dialog)
 ├─ useDocxImportFlow()                 → state mašina + worker orkestracija
 │    ├─ file/htmlContent/parsedCards state
 │    ├─ handleFileSelect (mammoth dynamic import + sanitizeHtml)
 │    ├─ parseContent() → koristi pure funkcije
 │    └─ reset()
 └─ lib/docx/splitIntoSections.ts       → PURE
       ├─ splitIntoSections(html, opts) → Section[]
       └─ splitIntoCards(html, opts)    → ParsedCard[]
```

### Promjene po fajlovima
1. **NEW** `src/lib/docx/splitIntoSections.ts` — pure funkcije sa eksplicitnim `opts: { mode, heading, delimiter }`; nema React, nema state. Direktno testabilno preko JSDOM-a u Vitest-u.
2. **NEW** `src/features/docx-importer/useDocxImportFlow.ts` — vlasnik svih `useState` polja, `handleFileSelect`, `parseContent`, `reset`. Vraća granuliran API: `{ step, file, htmlContent, parsedCards, splitConfig, setSplitConfig, handleFileSelect, parseContent, reset, importCards }`.
3. **EDIT** `src/features/docx-importer/DocxImporter.tsx` — postaje slim presenter (~180 LOC): 3 conditional render bloka po `step`, sav state ide kroz hook.

### Net efekat
- −220 LOC iz UI komponente
- +1 čisto testabilan `lib/docx/*` modul (kandidat za novi unit test)
- +1 hook koji izoluje `mammoth` dynamic import i worker pattern

---

## R5 — `SubjectDashboard.tsx` (P1)

### Trenutno stanje
- 4 `useMemo` bloka rade na različitim agregacijama: `categoryRec` lookup, `subjectSubcategories`, `bySubcategory`/`byChapter` bucketing, `subProgressData` (sa nested mastery + pct po podkategoriji i poglavlju), `subjectDueCount`, `coreActions`.
- `subProgressData` (lin 75–105) — težak nested compute (mastery, pct, learned sections) — kandidat za pomeranje u domenski selektor.
- View fajl meša: navigacija, dialog state (`infoOpen`/`matrixOpen`), `buildQuery` URL handler, knowledge base & core action konfiguracija, i veliku JSX strukturu (3 sekcije).

### Target arhitektura
```text
SubjectDashboard.tsx (~180 LOC, presenter — header + 3 sekcije + 2 dijaloga)
 └─ useSubjectDashboardModel(categoryId)
       ├─ categoryRec, categoryName, subjectSubcategories
       ├─ subjectCards (preko useCardsByCategory)
       ├─ subjectDueCount
       └─ subProgressData (koristi lib/subject/aggregators.ts)

 └─ lib/subject/aggregators.ts          → PURE
       └─ aggregateSubjectProgress(subjectCards, subcategories) → SubProgress[]
            (bucketing + mastery + pct + nested chapter rollup u jednoj pass-i)
```

### Promjene po fajlovima
1. **NEW** `src/lib/subject/aggregators.ts` — pure `aggregateSubjectProgress(cards, subcategories)` koji u jednom prolazu izračuna sub-level i nested chapter-level mastery + pct + section counts.
2. **NEW** `src/hooks/useSubjectDashboardModel.ts` — vraća `{ categoryRec, categoryName, subjectCards, subjectSubcategories, subjectDueCount, subProgressData }`. Skida `useCardData`/`useCategoryData`/`useCardsByCategory` iz view-a.
3. **EDIT** `src/views/SubjectDashboard.tsx` — postaje presenter (~180 LOC). Zadržava lokalni `useState` za `infoOpen`/`matrixOpen` (čisti UI state), `handleMatrixStart` (URL navigacija), i konfiguracione const-ove (`knowledgeBaseCards`, `coreActions`).

### Net efekat
- −180 LOC iz view fajla
- +1 testabilan `lib/subject/aggregators.ts` modul (mastery rollup logika dobija unit-test pokrivenost)
- +1 orchestrator hook po projektnom obrascu (Core memory: "Orchestrator pattern for complex views")

---

## Tehničke napomene

- **Bez izmjena u ponašanju.** Oba refaktora su čisto strukturalna — isti inputi → isti outputi. Mastery brojanje, FSRS state computation, mammoth parsing i sanitizacija ostaju identični.
- **Tipovi:** Pure funkcije eksportuju eksplicitne `interface SubProgress`/`interface Section`/`interface ParsedCard` (zero-any policy se poštuje).
- **ESLint zid:** Novi `useSubjectDashboardModel` hook konzumira `useCardData`/`useCategoryData`/`useCardsByCategory` kroz postojeće Public API barrel-e (`@/contexts`, `@/store`) — nema novih DB importa.
- **Testovi:** Predlažem dodavanje 2 nova unit testa:
  - `src/test/docx-split-into-sections.test.ts`
  - `src/test/subject-progress-aggregator.test.ts`
- **Migracija postojećih konzumera:** Nema; oba fajla su koristila lokalne pomoćne funkcije/state, nema eksternih importa za podesiti.

## Out of scope (kasnije, opciono)

Iz audita preostaje i **R6 — localStorage thin hooks** (`GlobalSearch`, `PassiveReader`, `LearnSession`, `SubjectHierarchyTree`, `BulkImportDialog`) koji bi trebali dobiti `useReadingPosition`/`usePersistedSet`/`useSessionState` thin wrappere. To je širi scope i predlažem ga kao zaseban PR nakon što R4+R5 slegnu.
