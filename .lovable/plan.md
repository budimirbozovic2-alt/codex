
# FSRS Audit & Refactor — Findings and Fixes

Direct verdict: **all four bugs you reported are real and present in the code.** I also found three additional issues worth fixing in the same pass. None of the fixes are speculative — every change is anchored to a specific line you can grep.

---

## Confirmed bugs

### 1. Zombie cards in Critical mode — CONFIRMED
`src/lib/review-mode-builder.ts` `buildCriticalItems`:
```ts
if (r >= 80 && r <= 85) items.push({ card, section });
```
A card that drifts to R=75% is due, not Learning, not a Leech, and falls through every mode. Permanent zombie.

### 2. Cramming corruption — CONFIRMED
`src/hooks/useCardAnnotations.ts` calls `calculateNextReview` unconditionally. `StudyModeRecall.tsx` has a partial guard ("only grade due sections") but it does **not** cover the case where a section was reviewed today and is now scheduled `now + 4d` — `nextReview > now` is not checked. The user can re-open the card in Learn mode and grade it "Good", inflating stability from `S → S*3+1`. The correct place for the guard is the algorithm itself, so every caller is safe.

### 3. "Easy" penalty on New cards — CONFIRMED
`src/lib/sr/algorithm.ts`:
```ts
if (isNew && grade >= 3) {
  const delayMs = grade === 3 ? 15 * 60 * 1000 : 20 * 60 * 1000;
  finalState = SectionState.Learning;
  finalFirstReviewPending = true;
}
```
Easy(4) on a New card → 20 minutes and stuck in Learning. `INITIAL_VALUES[4]` (S=7, D=3) is computed and then thrown away.

### 4. Deceptive average retrievability — CONFIRMED
`src/lib/sr/retrievability.ts` `getCardRetrievability` returns the **mean** across sections. A card with [95, 95, 20] reports 70 — hides the failing module. Used in `CardRow`, `PassiveReader`, `LocalSpeedReader`, `ResistanceTab`.

---

## Additional issues found

### 5. `retentionBoost` clamp drift
`computeAdaptiveModifiers` clamps `intervalMultiplier` but NOT `retentionBoost`. Combined frequency + examiner modifiers can push effective retention to 0.99+. Algorithm clamps it later via `RETENTION_MAX`, but the **review log** stores the unclamped value at `useCardAnnotations.ts:60` (it uses a hardcoded `0.98` instead of the constant). Fix: clamp inside `computeAdaptiveModifiers` and reuse `RETENTION_MIN/MAX` constants in the log.

### 6. `lapses` increment on New + grade 1
```ts
if (isNew) { ... if (grade === 1) newLapses += 1; }
```
A "New" card has never been learned — counting Again as a lapse on first exposure makes Leech threshold trip on cards that are merely hard to onboard. Lapses should only count on transitions from Review → Relearning.

### 7. Wasted O(N) per-review iteration in errorLog
`useCardAnnotations.ts:39-47` rebuilds the entire `errorLog` array (`map`) on every grade even when nothing about an entry actually changes for non-matching errors. With 50+ errors per card, hot path. Cheap win: skip the map when `errorLog.length === 0` (already partly done) and avoid spreading `...e` when no field changes — but the bigger win is to only mutate this when grade ∈ {1,3,4} (currently grade 2 also triggers a no-op-ish rebuild via the `>= 3` branch — fine, but the structure is fragile).

### 8. Floating point in `formatInterval`
Minor: `interval < 1/24` then `Math.round(interval * 24 * 60)` can return 0 minutes for intervals between 0 and ~30s, displaying "0min". Floor to 1.

---

## Code fixes

### Fix 1 — Critical mode catches all overdue R ≤ 85
`src/lib/review-mode-builder.ts`:
```ts
export function buildCriticalItems(args: BuildArgs): DueItem[] {
  const now = args.now ?? Date.now();
  const items: DueItem[] = [];
  for (const card of args.allCards) {
    for (const section of card.sections) {
      if (section.state === SectionState.New) continue;
      if (section.nextReview > now) continue;       // strict due-only
      const r = getRetrievability(section);
      if (r <= 85) items.push({ card, section });   // catch-all for overdue
    }
  }
  // Worst R first — most urgent
  items.sort((a, b) => getRetrievability(a.section) - getRetrievability(b.section));
  return items;
}
```
Update test `buildCriticalItems` accordingly (the existing test that requires R ∈ [80,85] should be loosened to "R ≤ 85 AND due").

### Fix 2 — Algorithm-level cramming guard
`src/lib/sr/algorithm.ts`, top of `calculateNextReview`:
```ts
const now = Date.now();
const isNew = section.state === SectionState.New;
const isPendingFirstReview = section.firstReviewPending === true;

// Cramming guard: if section is graded before its scheduled time and is
// not New / not in a learning step, do NOT mutate FSRS parameters.
// Only refresh lastReviewed so UI reflects the touch.
if (!isNew && !isPendingFirstReview && now < section.nextReview) {
  return { lastReviewed: now };
}
```
This is one source of truth — `useCardAnnotations`, `LearnSession`, `ReviewSession`, and any future caller are all protected. Also remove the leaky duplicate in `StudyModeRecall.tsx` (the dueOnly filter) so the algorithm stays the only authority.

Update `previewIntervals` (`format.ts`) so the preview chips for non-due sections show "—" rather than calling the no-op path.

### Fix 3 — Easy on New graduates immediately
`src/lib/sr/algorithm.ts`:
```ts
if (isNew && grade >= 3) {
  if (grade === 4) {
    // Easy on a brand-new card: skip learning, go straight to Review with
    // the INITIAL_VALUES[4] stability (7 days).
    finalState = SectionState.Review;
    finalFirstReviewPending = false;
    finalNextReview = Date.now() + interval * 24 * 60 * 60 * 1000; // uses S=7
  } else {
    // grade === 3 keeps the existing 15-min learning step.
    const delayMs = 15 * 60 * 1000;
    finalNextReview = Date.now() + delayMs;
    finalState = SectionState.Learning;
    finalFirstReviewPending = true;
  }
}
```

### Fix 4 — Retrievability surfaces worst section
`src/lib/sr/retrievability.ts`:
```ts
export function getCardRetrievability(card: Card): number {
  if (card.sections.length === 0) return 0;
  const reviewed = card.sections.filter(s => s.state !== SectionState.New);
  if (reviewed.length === 0) return 0;
  let min = Infinity;
  for (const s of reviewed) {
    const r = getRetrievability(s);
    if (r < min) min = r;
  }
  return min === Infinity ? 0 : min;
}
```
Update the test `getCardRetrievability averages sections` (rename) and call sites' tooltip copy in `CardRow.tsx` to "Najslabiji modul: X%".

### Fix 5 — Clamp `retentionBoost` in adaptive
`src/lib/sr/adaptive.ts` end of `computeAdaptiveModifiers`:
```ts
const RETENTION_BOOST_LIMIT = 0.05; // ±5pp at most
return {
  retentionBoost: clamp(retentionBoost, -RETENTION_BOOST_LIMIT, RETENTION_BOOST_LIMIT),
  intervalMultiplier: clamp(intervalMultiplier, INTERVAL_MULT_MIN, INTERVAL_MULT_MAX),
  reasons,
};
```
And in `useCardAnnotations.ts:60`:
```ts
entry.effectiveRetention = clamp(cachedRetention + mods.retentionBoost, RETENTION_MIN, RETENTION_MAX);
```

### Fix 6 — Don't count lapses on New cards
`src/lib/sr/algorithm.ts` remove `if (grade === 1) newLapses += 1;` from the `isNew` branch. Lapses only increment on Review → Relearning (the `else` branch's grade=1 already does this).

### Fix 7 — Cheap errorLog short-circuit
`useCardAnnotations.ts`: only `.map` when there is something to change (already gated on length>0; tighten by snapshotting `c.errorLog` reference identity check after).

### Fix 8 — formatInterval floor
`format.ts`:
```ts
if (interval < 1 / 24) return `${Math.max(1, Math.round(interval * 24 * 60))}min`;
```

---

## Files to modify

- `src/lib/sr/algorithm.ts` — cramming guard, Easy-on-New graduation, lapses fix
- `src/lib/sr/adaptive.ts` — clamp `retentionBoost`
- `src/lib/sr/retrievability.ts` — `getCardRetrievability` → min
- `src/lib/sr/format.ts` — `formatInterval` floor; `previewIntervals` shows "—" for crammed sections
- `src/lib/review-mode-builder.ts` — Critical = `R ≤ 85 && due`
- `src/hooks/useCardAnnotations.ts` — use clamp constants in log
- `src/components/learn/StudyModeRecall.tsx` — remove now-redundant `dueOnly` filter (algorithm enforces it)
- `src/components/card-list/CardRow.tsx` — update tooltip copy ("Najslabiji modul")
- `src/test/review-mode-builder.test.ts` — update Critical test for R ≤ 85
- `src/test/spaced-repetition.test.ts` — update `getCardRetrievability` and `Easy on New` and `lapses` tests

---

## Memory updates after merge

Add a short rule to `mem://index.md` Core: *"FSRS: cramming guard lives in `calculateNextReview`. Grading a non-due, non-New, non-pending section returns `{lastReviewed}` only. Critical mode = R ≤ 85 AND due."*

No UI redesign, no schema migration. All changes are additive or in-place; existing card data remains valid (the only behavior change is that future grades behave correctly).
