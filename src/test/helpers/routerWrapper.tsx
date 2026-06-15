import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";

export function makeRouterWrapper(initialPath = "/") {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
}
