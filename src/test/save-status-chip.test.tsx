import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SaveStatusChip } from "@/components/ui/SaveStatusChip";

describe("SaveStatusChip", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<SaveStatusChip status="idle" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows dirty label", () => {
    render(<SaveStatusChip status="dirty" />);
    expect(screen.getByRole("status")).toHaveTextContent("Nesačuvane izmjene");
  });

  it("shows saving label", () => {
    render(<SaveStatusChip status="saving" />);
    expect(screen.getByRole("status")).toHaveTextContent("Čuvam…");
  });

  it("shows saved label", () => {
    render(<SaveStatusChip status="saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("Sačuvano");
  });

  it("shows error label", () => {
    render(<SaveStatusChip status="error" />);
    expect(screen.getByRole("status")).toHaveTextContent("Greška pri čuvanju");
  });
});
