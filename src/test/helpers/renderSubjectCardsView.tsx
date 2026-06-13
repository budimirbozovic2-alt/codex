import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import {
  MemoryRouter,
  Route,
  Routes,
  type MemoryRouterProps,
} from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import SubjectCardsView from "@/views/SubjectCardsView";
import { TEST_CATEGORY_ID } from "./subjectCardsHarness";

interface RenderSubjectCardsResult extends RenderResult {
  queryClient: QueryClient;
}

export function renderSubjectCardsView(
  path = `/subject/${TEST_CATEGORY_ID}/cards`,
  routerProps?: MemoryRouterProps,
): RenderSubjectCardsResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  window.history.replaceState({}, "", path);

  const view = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]} {...routerProps}>
          <Routes>
            <Route path="/subject/:categoryId/cards" element={<SubjectCardsView />} />
            <Route path="/edit" element={<div data-testid="edit-page">Edit</div>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );

  return { ...view, queryClient };
}
