/**
 * PassiveReaderCard — flash questions are visually distinguished from essays.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PassiveReaderCard } from "@/components/subject-cards/passive-reader/PassiveReaderCard";
import type { Card } from "@/lib/spaced-repetition";

function makeCard(over: Partial<Card>): Card {
  return {
    id: "c1",
    question: "Pitanje?",
    sections: [],
    categoryId: "cat",
    createdAt: 1,
    type: "essay",
    readCount: 0,
    ...over,
  } as Card;
}

describe("PassiveReaderCard — flash distinction", () => {
  it("labels a flash card as 'Blic pitanje'", () => {
    render(<PassiveReaderCard card={makeCard({ type: "flash" })} stats={null} />);
    expect(screen.getByText("Blic pitanje")).toBeInTheDocument();
    expect(screen.queryByText("Pasivno čitanje")).not.toBeInTheDocument();
  });

  it("labels an essay card as 'Pasivno čitanje'", () => {
    render(<PassiveReaderCard card={makeCard({ type: "essay" })} stats={null} />);
    expect(screen.getByText("Pasivno čitanje")).toBeInTheDocument();
    expect(screen.queryByText("Blic pitanje")).not.toBeInTheDocument();
  });
});
