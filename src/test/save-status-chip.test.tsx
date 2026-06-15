import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { SaveStatusChip } from "@/components/ui/SaveStatusChip";
import { renderWithI18n } from "@/test/helpers/render-with-i18n";

describe("SaveStatusChip", () => {
  it("renders nothing when idle", () => {
    const { container } = renderWithI18n(<SaveStatusChip status="idle" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows dirty label", () => {
    renderWithI18n(<SaveStatusChip status="dirty" />);
    expect(screen.getByRole("status")).toHaveTextContent("Nesačuvane izmjene");
  });

  it("shows saving label", () => {
    renderWithI18n(<SaveStatusChip status="saving" />);
    expect(screen.getByRole("status")).toHaveTextContent("Čuvam…");
  });

  it("shows saved label", () => {
    renderWithI18n(<SaveStatusChip status="saved" />);
    expect(screen.getByRole("status")).toHaveTextContent("Sačuvano");
  });

  it("shows error label", () => {
    renderWithI18n(<SaveStatusChip status="error" />);
    expect(screen.getByRole("status")).toHaveTextContent("Greška pri čuvanju");
  });
});
