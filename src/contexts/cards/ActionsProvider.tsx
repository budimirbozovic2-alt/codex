/** @deprecated Provider Cleanup v2 — Actions are now plain hooks composed
 *  in `useActions.ts`. This file remains only as a no-op shim. */
import type { ReactNode } from "react";

export function ActionsProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
