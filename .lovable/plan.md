# PR-G7 (RC-7): Tooling guardrails — strict TS + ESLint regression net

Cilj: zaključati postojeću strict TypeScript + ESLint poziciju tako da je
silent regresija (downgrade `error`→`warn`, isključen `strictNullChecks`,
ručno gašenje vitest izolacije) odmah uhvaćena u CI, ne tek na review-u.

PR-G7 NE uvodi nove rule-ove — sve diskretne stroge stavke (`no-explicit-any`
= error, `no-unused-vars` = error, W7 dangerouslySetInnerHTML ban, G7
raw-timer ban, `strict` + `strictNullChecks`, vitest `clearMocks` /
`restoreMocks`) već su uvedene u ranijim PR-ovima (RC-1..RC-6, PR-G4).
G7 ih samo **proklamuje invarijantama** preko statičkog testa.

## Izmjene

### 1. `src/test/pr-g7-tooling-guardrails.test.ts` (novo)
Statički regresioni guard sa 6 nezavisnih očekivanja, jedan po
root-cause-u:

- **RC-7a — vitest isolation:** `vitest.config.ts` mora zadržati
  `clearMocks: true` i `restoreMocks: true`. Sprječava da `vi.spyOn`
  procuri između testova i maskira regresiju.
- **RC-7b — type-erosion:** `eslint.config.js` mora držati globalno
  `@typescript-eslint/no-explicit-any` = `"error"`, nikad `"warn"`.
- **RC-7c — dead-code drift:** Globalni
  `@typescript-eslint/no-unused-vars` mora biti `["error", …]`.
- **RC-7d — null-safety:** `strict` i `strictNullChecks` true u
  `tsconfig.app.json`, `tsconfig.test.json` i `tsconfig.json`.
- **RC-7e — XSS guard (W7):** `JSXAttribute[name.name='dangerouslySetInnerHTML']`
  i `W7_DANGEROUS_HTML` selektori i dalje wired u ESLint configu.
- **RC-7f — G7 timer base ban:** `BASE_RESTRICTED_SYNTAX` i dalje sadrži
  `setTimeout`/`setInterval` selektore, tako da svaki override blok koji
  spread-uje BASE zadržava timer ban.

Svaka tvrdnja je read + regex/JSON.parse na config fajlu — deterministička,
zero-dependency, ~10ms total.

## Što PR-G7 NE radi

- Ne flipuje `noImplicitAny` na `true` (ostaje `false` u
  `tsconfig.app.json`); to bi otvorilo zaseban drain i ide u eventualni
  PR-G8.
- Ne pokreće ESLint/tsc iz testa — CI workflow (`.github/workflows/ci.yml`)
  i dalje ima dedicated lint+typecheck job. G7 je samo regression-net za
  *konfiguraciju* tih jobova.
- Ne mijenja proizvodni kod.

## Verifikacija

- `bunx vitest run pr-g4 pr-g5 pr-g6 pr-g7` — **21/21 ✓**
  (svih 6 G7 guard-ova prošlo prve iteracije).
- `bunx tsc --noEmit` — 0 grešaka.
