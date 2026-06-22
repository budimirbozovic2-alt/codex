/**
 * StrategicPlanner shell + planner config persistence smoke.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StrategicPlanner from "@/components/StrategicPlanner";
import { makeQueryWrapper } from "@/test/helpers/queryWrapper";
import { makeCard, makeSection } from "@/test/factories";
import type { CategoryRecord } from "@/lib/db-types";
import { loadPlanner, savePlanner, DEFAULT_CONFIG } from "@/domains/planner";
import { plannerCache } from "@/domains/planner/cache";
import { addDays } from "date-fns";
import { StudyFlowWidget } from "@/components/dashboard/StudyFlowWidget";

vi.mock("@/lib/analytics/workerClient", () => ({
  analyticsClient: {
    runCategoryStability: vi.fn(async () => []),
  },
}));

const CATEGORY_ID = "cat-planner";

function renderPlanner(configured = false) {
  const cards = [
    makeCard({
      id: "p-card-1",
      categoryId: CATEGORY_ID,
      question: "Pitanje",
      sections: [
        makeSection({ id: "s1", lastReviewed: null }),
        makeSection({ id: "s2", lastReviewed: Date.now() }),
      ],
    }),
  ];
  const categoryRecords: CategoryRecord[] = [
    { id: CATEGORY_ID, name: "Testni predmet", sortOrder: 0, subcategories: [] },
  ];

  if (configured) {
    const goal = addDays(new Date(), 45).toISOString().slice(0, 10);
    plannerCache.set({
      ...DEFAULT_CONFIG,
      finalGoalDate: goal,
      dailyAvailableMinutes: 90,
      subjectOrder: [CATEGORY_ID],
      bufferPercent: 0,
    });
  }

  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <StrategicPlanner
        cards={cards}
        categories={["Testni predmet"]}
        categoryRecords={categoryRecords}
        reviewLog={[]}
        onNavigateToDatabase={vi.fn()}
      />
    </MemoryRouter>,
    { wrapper: makeQueryWrapper() },
  );
}

describe("Strategic Planner", () => {
  beforeEach(() => {
    plannerCache.set({ ...DEFAULT_CONFIG });
  });

  it("renders header and tab navigation", () => {
    renderPlanner();
    expect(screen.getByRole("heading", { name: "Strateški planer" })).toBeInTheDocument();
    expect(screen.getByText("Planiranje")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Operativni plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mapa puta/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Disciplina/i })).toBeInTheDocument();
  });

  it("configured planner shows learn session CTA on operations tab", async () => {
    renderPlanner(true);
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Započni sesiju/i })).toBeInTheDocument();
    });
    const link = screen.getByRole("link", { name: /Započni sesiju/i });
    expect(link.getAttribute("href")).toContain(
      `/learn?mode=strict-recall&category=${encodeURIComponent(CATEGORY_ID)}`,
    );
  });

  it("configured planner shows daily targets in smart suggestion", async () => {
    renderPlanner(true);
    await waitFor(() => {
      expect(screen.getByText(/Danas:.*ponavljanja.*novih/i)).toBeInTheDocument();
    });
  });

  it("savePlanner updates in-memory config (SQLite write is async)", async () => {
    const goal = addDays(new Date(), 45).toISOString().slice(0, 10);
    const next = {
      ...DEFAULT_CONFIG,
      finalGoalDate: goal,
      dailyAvailableMinutes: 90,
      subjectOrder: [CATEGORY_ID],
    };
    await savePlanner(next);
    expect(loadPlanner().finalGoalDate).toBe(goal);
    expect(loadPlanner().dailyAvailableMinutes).toBe(90);
  });
});

describe("StudyFlowWidget", () => {
  it("renders learn and review CTAs when review target > 0", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <StudyFlowWidget
          data={{
            focusSubject: "Testni predmet",
            focusCategoryId: CATEGORY_ID,
            dailyProgress: 1,
            dailyQuota: 5,
            learnPct: 70,
            reviewPct: 30,
            learnTarget: 3,
            reviewTarget: 2,
            ratioLabel: "Balans",
            overallPct: 10,
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Plan za danas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Započni" })).toHaveAttribute(
      "href",
      `/learn?mode=strict-recall&category=${encodeURIComponent(CATEGORY_ID)}`,
    );
    expect(screen.getByRole("link", { name: "Ponovi" })).toHaveAttribute("href", "/review");
  });
});
