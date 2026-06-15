import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { PageHeader } from "@/components/ui/PageHeader";
import { renderWithI18n } from "@/test/helpers/render-with-i18n";

describe("PageHeader", () => {
  it("renders eyebrow, title, and subtitle", () => {
    renderWithI18n(      <PageHeader
        eyebrow="Kategorija"
        title="Krivično pravo"
        subtitle="Pregled izvora i karata"
      />,
    );

    expect(screen.getByText("Kategorija")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Krivično pravo" })).toBeInTheDocument();
    expect(screen.getByText("Pregled izvora i karata")).toBeInTheDocument();
  });

  it("calls back action with custom label", () => {
    const onBack = vi.fn();
    renderWithI18n(
      <PageHeader
        title="Naslov"
        back={{ label: "Početna", onClick: onBack }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Početna" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders scope badge, actions, and footer slots", () => {
    renderWithI18n(
      <PageHeader
        title="Sesija"
        scopeBadge="Zaključano"
        actions={<button type="button">Akcija</button>}
        footer={<p>Footer sadržaj</p>}
      />,
    );

    expect(screen.getByText("Zaključano")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Akcija" })).toBeInTheDocument();
    expect(screen.getByText("Footer sadržaj")).toBeInTheDocument();
  });
});
