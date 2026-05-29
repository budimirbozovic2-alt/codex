import { ReactNode } from "react";
import { useLocation } from "react-router-dom";

/**
 * Lightweight CSS-only route transition.
 * Re-mounts children on pathname change with .animate-fade-up.
 * Honors prefers-reduced-motion via the global animation utility.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  // Strip leading segment so query-only changes don't re-trigger
  return (
    <div key={pathname} className="animate-fade-up">
      {children}
    </div>
  );
}
