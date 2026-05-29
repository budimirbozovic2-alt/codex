import { cn } from "@/lib/utils";

/**
 * Premium shimmer skeleton — single source of truth for loading placeholders.
 * Honours `prefers-reduced-motion` via Tailwind's `motion-reduce` variant.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.06] before:to-transparent",
        "before:animate-[shimmer_1.6s_linear_infinite]",
        "motion-reduce:before:animate-none",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
