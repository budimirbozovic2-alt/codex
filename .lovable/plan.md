I will fix the consolidation flow so it cannot show or accept FSRS grades before the answer is explicitly revealed.

Planned changes:

1. Harden the shared grading component
   - Update `src/components/learn/GradeButtons.tsx` to support a `disabled`/guarded state and ARIA disabled semantics.
   - This makes the component safer if reused elsewhere later.

2. Fix Consolidation UI gating
   - In `src/components/review/ReviewCard.tsx`, keep `GradeButtons` mounted only in the `showAnswer === true` branch.
   - Add a defensive guard inside `handleGradeWithCalibration`: if `showAnswer` is false, return immediately and do not call `onGrade`.
   - Pass the revealed state down to `GradeButtons` so even accidental render paths cannot submit a grade before reveal.

3. Fix keyboard shortcut messaging
   - Update the visible shortcuts in `src/components/review/review-constants.ts` and `src/components/learn/SessionHeader.tsx` so `1–4` is explicitly described as available only after reveal.
   - This removes the misleading impression that numeric grading is available from the beginning of the card.

4. Verify all grading entry points
   - Re-scan the codebase for all `GradeButtons`, `[1, 2, 3, 4]`, and `onGrade` rendering paths.
   - Ensure Consolidation and Active Recall both follow the required flow:

```text
Question -> attempt recall -> reveal answer -> grade 1-4
```

5. Build/type-check after implementation
   - Run the project’s build/type-check to catch any regressions.

Expected result:
- In Konsolidacija, before pressing `Prikaži odgovor`, the user sees only the question, optional confidence calibration, and the reveal button.
- The FSRS 1–2–3–4 buttons are not usable before reveal.
- Keyboard numbers 1–4 cannot grade before reveal.
- After reveal, the answer and grading buttons appear normally.