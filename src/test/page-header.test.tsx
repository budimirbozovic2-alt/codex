import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PageHeader } from "@/components/ui/PageHeader";

describe("PageHeader", () => {
  it("renders eyebrow, title, and subtitle", () => {
    render(
      <PageHeader
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
    render(
      <PageHeader
        title="Naslov"
        back={{ label: "Početna", onClick: onBack }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Početna" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders scope badge, actions, and footer slots", () => {
    render(
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
