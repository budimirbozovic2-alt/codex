import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StatsPage from "@/views/StatsPage";
import PlannerPage from "@/views/PlannerPage";
import RetentionChart from "@/components/RetentionChart";
import ActivityHeatmap from "@/components/ActivityHeatmap";

const cardStateMock = vi.hoisted(() => ({
  useCardData: () => ({
    cards: [],
    dueCards: [],
    stats: {
      due: 0,
      total: 0,
      totalSections: 0,
      learnedSections: 0,
      leechCount: 0,
    },
    ready: true,
  }),
  useReviewData: () => ({
    reviewLog: [],
    srSettings: { dailyGoal: 10 },
  }),
  useCategoryStatsData: () => ({ categoryStats: {} }),
}));

vi.mock("@/hooks/cards/useCardState", () => cardStateMock);

vi.mock("@/hooks/cards/useCategoryState", () => ({
  useCategoryData: () => ({
    categories: [],
    categoryRecords: [],
    subcategories: {},
  }),
}));

vi.mock("@/components/MyStats", () => ({
  default: () => (
    <div>
      <span>Analitika</span>
      <h1>Statistika</h1>
    </div>
  ),
}));

vi.mock("@/components/StrategicPlanner", () => ({
  default: () => (
    <div>
      <span>Planiranje</span>
      <h1>Strateški planer</h1>
    </div>
  ),
}));

describe("Stats/Planner page shell", () => {
  it("StatsPage renders PageHeader after DataReadyGate", async () => {
    render(<StatsPage />);
    expect(await screen.findByRole("heading", { name: "Statistika" })).toBeInTheDocument();
    expect(screen.getByText("Analitika")).toBeInTheDocument();
  });

  it("PlannerPage renders PageHeader after DataReadyGate", async () => {
    render(<PlannerPage />);
    expect(
      await screen.findByRole("heading", { name: "Strateški planer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Planiranje")).toBeInTheDocument();
  });

  it("StatsPage does not show dashboard skeleton when boot is ready", () => {
    render(<StatsPage />);
    expect(screen.queryByTestId("dashboard-skeleton")).not.toBeInTheDocument();
  });
});

describe("Stats chart cards — glass-card shell", () => {
  it("RetentionChart uses glass-card styling", () => {
    const { container } = render(<RetentionChart reviewLog={[]} />);
    expect(container.querySelector(".glass-card")).toBeTruthy();
    expect(screen.getByText("Retencija tokom vremena")).toBeInTheDocument();
  });

  it("ActivityHeatmap uses glass-card styling", () => {
    const { container } = render(<ActivityHeatmap reviewLog={[]} />);
    expect(container.querySelector(".glass-card")).toBeTruthy();
    expect(screen.getByText("Aktivnost")).toBeInTheDocument();
  });
});
