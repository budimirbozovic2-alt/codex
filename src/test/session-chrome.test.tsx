import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { SessionChrome } from "@/components/SessionChrome";
import { renderWithI18n } from "@/test/helpers/render-with-i18n";
vi.mock("@/lib/motion", () => ({
  m: {
    div: ({
      animate,
      className,
      ...props
    }: {
      animate?: { width?: string };
      className?: string;
    }) => <div className={className} style={{ width: animate?.width }} {...props} />,
  },
}));

vi.mock("@/components/ShortcutsHint", () => ({
  default: ({ shortcuts }: { shortcuts: Array<{ keys: string; description: string }> }) => (
    <div data-testid="shortcuts-hint">{shortcuts.length}</div>
  ),
}));

describe("SessionChrome", () => {
  it("renders progress bar width from current/total", () => {
    const { container } = renderWithI18n(
      <SessionChrome
        onBack={vi.fn()}
        progressLabel="3 / 10"
        progressCurrent={3}
        progressTotal={10}
        shortcuts={[{ keys: "Space", description: "Otkrij" }]}
      />,
    );

    const bar = container.querySelector(".bg-primary.rounded-full") as HTMLElement;
    expect(bar.style.width).toBe("30%");
  });

  it("uses zero width when total is zero", () => {
    const { container } = renderWithI18n(
      <SessionChrome
        onBack={vi.fn()}
        progressLabel="0 / 0"
        progressCurrent={0}
        progressTotal={0}
        shortcuts={[]}
      />,
    );

    const bar = container.querySelector(".bg-primary.rounded-full") as HTMLElement;
    expect(bar.style.width).toBe("0%");
  });

  it("renders back, pause, badges, and shortcuts", () => {
    const onBack = vi.fn();
    const onPause = vi.fn();
    renderWithI18n(
      <SessionChrome
        onBack={onBack}
        onPause={onPause}
        backLabel="Izlaz"
        modeBadge={<span>Stabilizacija</span>}
        scopeBadge={<span>Kategorija A</span>}
        progressLabel="1 / 2"
        progressCurrent={1}
        progressTotal={2}
        shortcuts={[{ keys: "1", description: "Ocijeni" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Izlaz" }));
    fireEvent.click(screen.getByRole("button", { name: "Pauziraj sesiju" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Stabilizacija")).toBeInTheDocument();
    expect(screen.getByText("Kategorija A")).toBeInTheDocument();
    expect(screen.getByTestId("shortcuts-hint")).toHaveTextContent("1");
  });
});
