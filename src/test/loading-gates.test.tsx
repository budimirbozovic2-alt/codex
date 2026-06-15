import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataReadyGate } from "@/components/ui/loading/DataReadyGate";
import { DashboardSkeleton } from "@/components/ui/loading/DashboardSkeleton";
import { SessionSetupSkeleton } from "@/components/ui/loading/SessionSetupSkeleton";
import { SessionCardSkeleton } from "@/components/ui/loading/SessionCardSkeleton";

describe("DataReadyGate", () => {
  it("shows dashboard skeleton while boot data is loading", () => {
    render(
      <DataReadyGate ready={false} skeleton={<DashboardSkeleton />}>
        <div>Dashboard content</div>
      </DataReadyGate>,
    );

    expect(screen.getByTestId("dashboard-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard content")).not.toBeInTheDocument();
  });

  it("shows session setup skeleton while session boot is loading", () => {
    render(
      <DataReadyGate ready={false} skeleton={<SessionSetupSkeleton />}>
        <div>Session setup</div>
      </DataReadyGate>,
    );

    expect(screen.getByTestId("session-setup-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Session setup")).not.toBeInTheDocument();
  });

  it("shows session card skeleton for lazy recall loading", () => {
    render(
      <DataReadyGate ready={false} skeleton={<SessionCardSkeleton />}>
        <div>Recall card</div>
      </DataReadyGate>,
    );

    expect(screen.getByTestId("session-card-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Recall card")).not.toBeInTheDocument();
  });

  it("renders children once ready", () => {
    render(
      <DataReadyGate ready skeleton={<DashboardSkeleton />}>
        <div>Ready content</div>
      </DataReadyGate>,
    );

    expect(screen.queryByTestId("dashboard-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("Ready content")).toBeInTheDocument();
  });
});

describe("loading skeletons", () => {
  it("marks skeleton containers as busy", () => {
    const { rerender } = render(<DashboardSkeleton />);
    expect(screen.getByTestId("dashboard-skeleton")).toHaveAttribute("aria-busy", "true");

    rerender(<SessionSetupSkeleton />);
    expect(screen.getByTestId("session-setup-skeleton")).toHaveAttribute("aria-busy", "true");

    rerender(<SessionCardSkeleton />);
    expect(screen.getByTestId("session-card-skeleton")).toHaveAttribute("aria-busy", "true");
  });
});
