import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SourcesTab from "@/components/category/SourcesTab";
import { makeSource } from "./factories";

vi.mock("@/hooks/source/useSourceMutations", () => ({
  useSourceMutations: () => ({
    save: { mutateAsync: vi.fn() },
    remove: { mutateAsync: vi.fn() },
  }),
}));

vi.mock("@/hooks/useMindMaps", () => ({
  useMindMapsByCategory: () => ({ mindMaps: [], ready: true }),
}));

describe("SourcesTab search", () => {
  const sources = [
    makeSource({ id: "s1", title: "Krivični zakonik", sourceKind: "propis" }),
    makeSource({ id: "s2", title: "Ustav Crne Gore", sourceKind: "propis" }),
  ];

  it("filters sources by query and shows empty state", () => {
    render(
      <MemoryRouter>
        <SourcesTab
          categoryId="cat-1"
          sources={sources}
          onOpenReader={vi.fn()}
          onSourceUpdated={vi.fn()}
          bulkFlagNeedsReview={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Krivični zakonik")).toBeInTheDocument();
    expect(screen.getByText("Ustav Crne Gore")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pretraži izvore"), {
      target: { value: "ustav" },
    });

    expect(screen.queryByText("Krivični zakonik")).not.toBeInTheDocument();
    expect(screen.getByText("Ustav Crne Gore")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Pretraži izvore"), {
      target: { value: "nema takvog" },
    });

    expect(screen.getByText(/Nema rezultata za „nema takvog”/)).toBeInTheDocument();
  });
});
