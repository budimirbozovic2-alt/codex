import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TitleBar from "@/components/TitleBar";
import { uiStore } from "@/store/useUIStore";
import { makeRouterWrapper } from "./helpers/routerWrapper";

vi.mock("@/hooks/cards/useCategoryState", () => ({
  useCategoryData: () => ({
    categoryRecords: [{ id: "cat-1", name: "Krivično pravo", subcategories: [] }],
  }),
}));

const Router = makeRouterWrapper("/category/cat-1");

describe("TitleBar contextual branding", () => {
  beforeEach(() => {
    uiStore.setState({ titleBarContext: null, immersiveMode: false, editingCardId: null });
  });

  it("prefers uiStore context over route fallback", () => {
    uiStore.setState({
      titleBarContext: { label: "Krivično pravo", detail: "Zakon o krivičnom postupku" },
    });

    render(
      <Router>
        <TitleBar />
      </Router>,
    );

    expect(screen.getByText("Krivično pravo")).toBeInTheDocument();
    expect(screen.getByText("Zakon o krivičnom postupku")).toBeInTheDocument();
  });

  it("falls back to route label when store context is absent", () => {
    render(
      <Router>
        <TitleBar />
      </Router>,
    );

    expect(screen.getByText("Krivično pravo")).toBeInTheDocument();
  });
});
