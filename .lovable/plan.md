# PR-G8 (RC-8): `noImplicitAny: true` u sva tri tsconfig-a

Cilj: zatvoriti posljednju rupu zero-any politike — TypeScript je do sada
implicitno tretirao neoznačene parametre/funkcije kao `any` bez ESLint
greške jer ESLint guard hvata samo *eksplicitni* `: any`. PR-G8 flipuje
`noImplicitAny` na `true` u svim tsconfig-ovima i drain-uje rezultujuće
greške.

## Drain rezultat

`bunx tsc -p tsconfig.app.json --noEmit` nakon flipa: **samo 5 grešaka**,
sve u `src/views/SubjectCardsView.tsx`, sve TS7022/TS7023 ("implicitly
has type 'any' because it does not have a type annotation and is
referenced directly or indirectly in its own initializer").

Root cause je jedna inference petlja:

```text
buildExtras: () => ({ tab, manageMode, ... })
        │           inferred return
        ▼
useEditReturn<EditReturnSnapshot>({ buildExtras })
        │           inferred initialSnapshot
        ▼
useState<...>(initialSnapshot?.tab ...) → tab, manageMode, ...
        │           referenced by buildExtras
        ▼
(cycle)
```

## Izmjene

### 1. `src/views/SubjectCardsView.tsx` (1 linija anotacije)
- `buildExtras: (): Partial<EditReturnSnapshot> => ({ ... })`
- Eksplicitan povratni tip prekida cikličnu inferenciju; sve ostale state
  varijable se sad uredno tipuju iz `useEditReturn<EditReturnSnapshot>`.

### 2. `tsconfig.app.json`, `tsconfig.test.json`, `tsconfig.json`
- `"noImplicitAny": false` → `"noImplicitAny": true`.

### 3. `src/test/pr-g7-tooling-guardrails.test.ts` (RC-7d ažuriran)
- Postojeća tvrdnja za `strict` + `strictNullChecks` proširena: sad takođe
  zahtijeva `noImplicitAny === true` u sva 3 config-a. Sprječava silent
  regression nazad na implicit-any.

## Što PR-G8 NE radi

- Ne dira proizvodno ponašanje — `noImplicitAny` je kompajl-time guard,
  generisani kod identičan.
- Ne flipuje `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` —
  to su zaseban drain (vjerovatno PR-G9).

## Verifikacija

- `bunx tsc --noEmit` (sva 3 projekta) — 0 grešaka nakon fixa.
- `bunx vitest run pr-g4 pr-g5 pr-g6 pr-g7` — **21/21 ✓**, novi RC-7d guard
  uključen.
