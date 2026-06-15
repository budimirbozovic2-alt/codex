import type { ReactNode } from "react";

interface Props {
  ready: boolean;
  skeleton: ReactNode;
  children: ReactNode;
}

/** Renders a layout-shaped skeleton until async boot data is ready. */
export function DataReadyGate({ ready, skeleton, children }: Props) {
  if (!ready) return <>{skeleton}</>;
  return <>{children}</>;
}
