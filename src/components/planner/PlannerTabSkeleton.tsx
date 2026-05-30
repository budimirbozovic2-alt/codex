import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared loading skeleton for planner tabs (Operations / Roadmap / Discipline).
 * Rendered while `usePlannerData().subjectPlans === null` (lazy planner
 * module still loading). Mirrors the rough shape of each tab so the layout
 * doesn't jump when real content arrives.
 *
 * Perf notes:
 *  - `React.memo` short-circuits re-renders during planner phase / data
 *    updates: parent (`StrategicPlanner`) re-renders on every `usePlannerData`
 *    tick, but as long as `variant` stays the same the skeleton subtree is
 *    skipped entirely (props are a single primitive string).
 *  - `BLOCKS` and `VARIANT_LABEL` are module-level constants so we don't
 *    rebuild the height arrays on every render.
 *  - Per-block element identity is stable via `key={variant}-{i}` derived
 *    keys, which lets React keep the same DOM nodes when the same variant
 *    re-mounts.
 *
 * Uses the shared `<Skeleton>` ui primitive (single shimmer source of truth).
 */
type Variant = "operations" | "roadmap" | "discipline";

interface Props {
  variant: Variant;
}

const BLOCKS: Record<Variant, readonly number[]> = {
  operations: [96, 160, 128, 112],
  roadmap:    [80, 280, 120],
  discipline: [64, 180, 96, 96],
};

const VARIANT_LABEL: Record<Variant, string> = {
  operations: "Učitavanje kartice Operacije…",
  roadmap: "Učitavanje kartice Plan puta…",
  discipline: "Učitavanje kartice Disciplina…",
};

function PlannerTabSkeletonImpl({ variant }: Props) {
  const blocks = BLOCKS[variant];
  const label = VARIANT_LABEL[variant];

  return (
    <div
      className="space-y-3"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={label}
    >
      {blocks.map((h, i) => (
        <Skeleton
          key={`${variant}-${i}`}
          className="rounded-xl border border-border/60"
          style={{ height: h }}
          aria-hidden="true"
        />
      ))}
      <p className="sr-only">{label} Sadržaj će se prikazati za nekoliko trenutaka.</p>
    </div>
  );
}

/**
 * Memoized export — single primitive prop, so default reference equality is
 * exactly what we want. Parent re-renders during planner phase transitions
 * (config saves, velocity recompute, discipline log updates) no longer cost
 * a skeleton rebuild as long as `variant` is unchanged.
 */
const PlannerTabSkeleton = memo(PlannerTabSkeletonImpl);
PlannerTabSkeleton.displayName = "PlannerTabSkeleton";

export default PlannerTabSkeleton;
