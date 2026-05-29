import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared loading skeleton for planner tabs (Operations / Roadmap / Discipline).
 * Rendered while `usePlannerData().subjectPlans === null` (lazy planner
 * module still loading). Mirrors the rough shape of each tab so the layout
 * doesn't jump when real content arrives.
 *
 * Uses the shared `<Skeleton>` ui primitive — single source of truth for
 * shimmer animation (previously duplicated as `.skeleton-premium` in CSS).
 */
interface Props {
  variant: "operations" | "roadmap" | "discipline";
}

const VARIANT_LABEL: Record<Props["variant"], string> = {
  operations: "Učitavanje kartice Operacije…",
  roadmap: "Učitavanje kartice Plan puta…",
  discipline: "Učitavanje kartice Disciplina…",
};

export default function PlannerTabSkeleton({ variant }: Props) {
  const blocks =
    variant === "operations" ? [96, 160, 128, 112] :
    variant === "roadmap"    ? [80, 280, 120]       :
                               [64, 180, 96, 96];

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
          key={i}
          className="rounded-xl border border-border/60"
          style={{ height: h }}
          aria-hidden="true"
        />
      ))}
      <p className="sr-only">{label} Sadržaj će se prikazati za nekoliko trenutaka.</p>
    </div>
  );
}
