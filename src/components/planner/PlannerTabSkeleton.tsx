/**
 * Shared loading skeleton for planner tabs (Operations / Roadmap / Discipline).
 * Rendered while `usePlannerData().subjectPlans === null` (lazy planner
 * module still loading). Mirrors the rough shape of each tab so the layout
 * doesn't jump when real content arrives.
 */
interface Props {
  variant: "operations" | "roadmap" | "discipline";
}

const SHELL = "rounded-xl bg-card/50 border border-border/60 animate-pulse";

export default function PlannerTabSkeleton({ variant }: Props) {
  const blocks =
    variant === "operations" ? [96, 160, 128, 112] :
    variant === "roadmap"    ? [80, 280, 120]       :
                               [64, 180, 96, 96];

  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      {blocks.map((h, i) => (
        <div key={i} className={SHELL} style={{ height: h }} />
      ))}
      <p className="sr-only">Učitavanje planera…</p>
    </div>
  );
}
