# PR-E1 — Enable `strictNullChecks` + fix planner/satellite mismatches

## Goal

Flip `strictNullChecks: true` in both `tsconfig.app.json` and `tsconfig.json`, then fix every TS2322/TS2339/TS2345/TS2349/TS18048 error TS surfaces. Build must pass clean. All 604 tests must remain green. No behavioral changes.

## Scope (16 errors, 9 files)

### Group A — Planner type chain (the meat)

Root cause: `PlannerConfig.finalGoalDate: string | null` (in `src/domains/planner/types.ts`), but consumers/utilities type the same field as `string | undefined` or assume `string`. And `usePlannerData` legitimately returns `T | null` until the lazy planner module loads, but the Tab prop types declare `T` (non-nullable). The existing `if (!data.isReady || subjectPlans === null) <Skeleton />` gate at `StrategicPlanner.tsx:129` ensures non-null at runtime, but TS can't see through it.

**A1 — `src/lib/query/hash.ts:40` — `hashPlannerConfig` signature**
Change `finalGoalDate?: string` → `finalGoalDate?: string | null`. Fixes `usePlannerData.ts:187` directly. Pure widening, no runtime change (template literal already does `?? ""`).

**A2 — `src/components/StrategicPlanner.tsx:138,157,159,169,170` — narrow `data` past the ready-gate**
The `data.velocity / data.burnupData / data.disciplineLog / data.disciplineTrend` fields are `T | null` in the hook return but the tabs require `T`. The runtime gate already guarantees non-null. Two implementation options:

- (preferred) After the `!data.isReady || subjectPlans === null` early-return, alias `data` into a locally-typed const that asserts the non-null shape, e.g.

  ```ts
  // After the gate, the hook contract guarantees these are populated.
  const ready = data as typeof data & {
    velocity: number;
    burnupData: BurnupDataPoint[];
    disciplineLog: DisciplineLogEntry[];
    disciplineTrend: DisciplineTrendPoint[];
  };
  ```
  Then pass `ready.velocity`, `ready.burnupData`, etc., into the tab props. One cast, localized, no public-API change. Add a short comment pointing at the gate.

- (alternative) Make tab prop types accept `T | null` and render their own skeleton fallbacks. Cleaner long-term but touches 3 tab components — out of scope for PR-E1.

We pick option A: minimal blast radius.

### Group B — Dashboard activePhase dead-narrow

**B1 — `src/hooks/useDashboardData.ts:161` — type the literal**
`const activePhase = null` is inferred as `null`, which collapses `plannerData.activePhase && ...` to `never` at `Dashboard.tsx:86,93,95,95`. Annotate explicitly:

```ts
const activePhase: { name: string; pct: number; learned: number; total: number } | null = null;
```

Already applied in the previous loop and works — verify it survives PR-E1 and that all 4 Dashboard errors clear.

### Group C — Satellite null/undefined mismatches

**C1 — `src/components/MainLayout.tsx:56` — optional chain on `planner.phases`**
`planner.phases` is `Phase[] | undefined` post-strict. Replace `planner.phases.length === 0` with `(planner.phases?.length ?? 0) === 0`. Already applied; verify.

**C2 — `src/lib/auto-split-engine.ts:136` — type the empty array**
`const contentLinesBetween = []` infers `never[]`. Annotate `const contentLinesBetween: number[] = []`. One-line fix.

**C3 — `src/lib/backup/import-transaction.ts:148` — `Card.sourceId` is `string | undefined`**
Assigning `null` violates the type. Change `card.sourceId = null` → `card.sourceId = undefined`. The scrub semantics are preserved (the optional field is cleared).

**C4 — `src/lib/persistence/sqlite/migrate-from-idb.ts:185` — bind value coercion**
`m.categoryId` on `MindMapDoc` may be `string | undefined`; `SqlBindValue` excludes `undefined`. Change to `m.categoryId ?? null` (matches the pattern used a few lines below at 192–195 for mnemonics).

**C5 — `src/lib/source-reader/build-essay-payload.ts:161` — drop undefined contentDoc**
`buildSectionDoc(content)` can return `EditorDoc | undefined`. The downstream type requires `EditorDoc`. Filter modules where `contentDoc` is undefined before assigning to `sections`, e.g.

```ts
const sections = modules
  .map((mod) => {
    const content = sanitizeHtml(mod.contentHtml);
    return { title: mod.title, contentDoc: buildSectionDoc(content) };
  })
  .filter((s): s is { title: string; contentDoc: EditorDoc } => s.contentDoc !== undefined);
```

This drops malformed sections rather than crashing — same defensive posture used elsewhere in the import path. Verify the existing essay-payload tests still pass.

### Group D — Test fixture

**D1 — `src/test/category-view-loading.test.tsx:98` — resolveFn narrowing**
TS narrows `let resolveFn = null` captured inside a Promise executor closure to `never` under strictNullChecks. Two paths:
- Use a definite assertion: `resolveFn!([])` on line 98.
- Or declare with an explicit `as` cast on the initial value: `let resolveFn = null as ((rows: never[]) => void) | null`.

We pick the cast (safer, no `!` runtime expectation).

## Implementation order

1. Flip flags: `tsconfig.app.json` → add `"strictNullChecks": true`; `tsconfig.json` → set `"strictNullChecks": true`.
2. Run `tsc -p tsconfig.app.json --noEmit` and confirm exactly the 16 errors documented above (no surprises).
3. Apply A1 (hash signature widening).
4. Apply A2 (StrategicPlanner narrowing alias).
5. Apply B1, C1 (re-verify previous-loop fixes still apply).
6. Apply C2–C5 in parallel.
7. Apply D1.
8. Re-run `tsc --noEmit` → 0 errors.
9. Re-run `npx vitest run` → 604/604 green.
10. Re-run `npm run lint` → no new violations.

## Out of scope (deferred)

- Enabling full `"strict": true` (also turns on `strictFunctionTypes`, `strictPropertyInitialization`, `alwaysStrict`, `strictBindCallApply`, `noImplicitThis`) — separate PR-E1b once null-checks land.
- Refactoring planner tab prop types to accept nullable inputs.
- `useDashboardData.activePhase` is always `null` in the current codebase; the Dashboard widget that consumes it is dead UI. Removal is a separate UX decision, not a type fix.

## Risk

Low. All edits are widenings, optional-chain insertions, or local casts. No control flow changes. The one defensive filter (C5) drops only malformed essay sections that would crash downstream anyway. Verified by full test run.

## Files touched (9)

- `tsconfig.app.json`, `tsconfig.json` — flag flip
- `src/lib/query/hash.ts` — A1
- `src/components/StrategicPlanner.tsx` — A2
- `src/hooks/useDashboardData.ts` — B1 (already applied)
- `src/components/MainLayout.tsx` — C1 (already applied)
- `src/lib/auto-split-engine.ts` — C2
- `src/lib/backup/import-transaction.ts` — C3
- `src/lib/persistence/sqlite/migrate-from-idb.ts` — C4
- `src/lib/source-reader/build-essay-payload.ts` — C5
- `src/test/category-view-loading.test.tsx` — D1

## Memory update on completion

Append to `mem://index.md` Core: `TypeScript: strictNullChecks enabled. Treat null/undefined as distinct; widen optional fields explicitly.`
