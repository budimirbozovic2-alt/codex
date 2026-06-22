import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSessionDiscipline } from "./useSessionDiscipline";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { makeCard, makeSection } from "@/test/factories";

const mutateSpy = vi.fn();

vi.mock("@/hooks/planner/usePlannerMutations", () => ({
  usePlannerMutations: () => ({
    recordDiscipline: { mutate: mutateSpy },
  }),
}));

function wrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSessionDiscipline", () => {
  beforeEach(() => {
    mutateSpy.mockClear();
  });

  it("records unique sections from review session", () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useSessionDiscipline(), { wrapper: wrapper(qc) });
    const reviewLog: ReviewLogEntry[] = [];
    const cards = [makeCard({ sections: [makeSection()] })];

    act(() => {
      result.current.trackSection("c1", "s1");
      result.current.trackSection("c1", "s1");
      result.current.trackSection("c2", "s2");
      result.current.recordAfterSession({ reviewLog, cards, elapsedMs: 6000 });
    });

    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ reviewsDone: 2 }),
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it("skips short idle sessions", () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useSessionDiscipline(), { wrapper: wrapper(qc) });

    act(() => {
      result.current.recordAfterSession({ reviewLog: [], cards: [], elapsedMs: 1000 });
    });

    expect(mutateSpy).not.toHaveBeenCalled();
  });

  it("records only once per session until reset", () => {
    const qc = new QueryClient();
    const { result } = renderHook(() => useSessionDiscipline(), { wrapper: wrapper(qc) });
    const cards = [makeCard()];

    act(() => {
      result.current.trackSection("c1", "s1");
      result.current.recordAfterSession({ reviewLog: [], cards, elapsedMs: 6000 });
      result.current.recordAfterSession({ reviewLog: [], cards, elapsedMs: 6000 });
    });

    expect(mutateSpy).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.resetSession();
      result.current.trackSection("c3", "s3");
      result.current.recordAfterSession({ reviewLog: [], cards, elapsedMs: 6000 });
    });

    expect(mutateSpy).toHaveBeenCalledTimes(2);
  });
});
