/**
 * SmartSplitSummaryDialog — wizard shell + module list keyed by stable ids.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SmartSplitSummaryDialog } from "@/components/source-reader/SmartSplitSummaryDialog";
import { useSourceReaderStore } from "@/store";
import { makeSource } from "./factories";
import type { SelectionModule } from "@/lib/selection-split-engine";

vi.mock("@/hooks/cards/useCategoryState", () => ({
  useCategoryData: () => ({ categoryRecords: [] }),
}));

vi.mock("@/components/editor-v4/EditorV4", () => ({
  EditorV4: ({ onChange, placeholder }: { onChange?: (doc: unknown) => void; placeholder?: string }) => (
    <textarea
      data-testid="editor-v4-mock"
      placeholder={placeholder}
      onChange={(e) => onChange?.({ version: 4, content: { type: "doc", content: [] } })}
    />
  ),
}));

const MODULES: SelectionModule[] = [
  {
    id: "mod-a",
    articleNum: "1",
    title: "čl. 1 Pojam",
    contentText: "Prvi modul sadržaj dovoljno dug.",
    contentHtml: "<p>Prvi modul sadržaj dovoljno dug.</p>",
    plainSnippet: "Član 1",
  },
  {
    id: "mod-b",
    articleNum: "2",
    title: "čl. 2 Obim",
    contentText: "Drugi modul sadržaj dovoljno dug.",
    contentHtml: "<p>Drugi modul sadržaj dovoljno dug.</p>",
    plainSnippet: "Član 2",
  },
];

describe("SmartSplitSummaryDialog", () => {
  const source = makeSource({ id: "src-wiz", title: "Krivični zakon" });
  const onConfirm = vi.fn();

  beforeEach(() => {
    onConfirm.mockClear();
    useSourceReaderStore.getState().reset();
    useSourceReaderStore.getState().setSplitSummaryOpen(true);
    useSourceReaderStore.getState().setSplitResult({
      modules: MODULES,
      rangeLabel: "čl. 1 – čl. 2",
      parentName: "čl. 1 Pojam",
    });
    useSourceReaderStore.getState().initSplitWizard(MODULES, "čl. 1 Pojam");
    useSourceReaderStore.getState().setSplitParentName("čl. 1 Pojam");
  });

  it("renders module cards and confirm action", () => {
    render(<SmartSplitSummaryDialog source={source} onSmartSplitConfirm={onConfirm} />);

    expect(screen.getByText("Novi esej iz izvora")).toBeInTheDocument();
    expect(screen.getByText("Modul 1")).toBeInTheDocument();
    expect(screen.getByText("Modul 2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("čl. 1 Pojam")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Kreiraj esej/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows success state after splitDone", () => {
    useSourceReaderStore.getState().setSplitDone(true);
    useSourceReaderStore.getState().setSplitCreatedCount(2);
    render(<SmartSplitSummaryDialog source={source} onSmartSplitConfirm={onConfirm} />);

    expect(screen.getByText(/Uspješno kreiran esej/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Kreiraj esej/i })).toBeNull();
  });
});
