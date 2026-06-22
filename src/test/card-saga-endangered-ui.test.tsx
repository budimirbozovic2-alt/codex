import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CardMasteryStatusBadge, EndangeredCountBadge } from "@/components/saga/CardMasteryStatusBadge";
import {
  shouldShowMasteredBadge,
  isEndangeredEssay,
  isMasteredEndangeredEssay,
  endangeredEssayTooltip,
  ENDANGERED_CONCEPT_LABEL,
  ENDANGERED_CONCEPT_SHORT,
  MASTERED_ENDANGERED_TOOLTIP,
  countEndangeredEssays,
} from "@/lib/saga/endangered-display";
import { makeCard, makeSection } from "@/test/factories";
import { SectionState } from "@/lib/spaced-repetition";

function masteredEssay(id = "e1") {
  return makeCard({
    id,
    type: "essay",
    isEndangered: false,
    sections: [
      makeSection({
        html: "<p>x</p>",
        lastReviewed: Date.now(),
      }),
    ],
  });
}

describe("endangered-display", () => {
  it("detects endangered essays", () => {
    expect(isEndangeredEssay(makeCard({ type: "essay", isEndangered: true }))).toBe(true);
    expect(isEndangeredEssay(makeCard({ type: "flash", isEndangered: true }))).toBe(false);
  });

  it("hides mastered badge when essay is endangered", () => {
    const essay = masteredEssay();
    // Force high stability for mastery level 5
    essay.sections[0]!.state = SectionState.Review;
    essay.sections[0]!.stability = 40;
    essay.sections[0]!.difficulty = 2;

    expect(shouldShowMasteredBadge(essay)).toBe(true);

    const endangered = { ...essay, isEndangered: true };
    expect(shouldShowMasteredBadge(endangered)).toBe(false);
  });

  it("countEndangeredEssays counts only essay cards", () => {
    const cards = [
      makeCard({ type: "essay", isEndangered: true }),
      makeCard({ type: "flash", isEndangered: true }),
      makeCard({ type: "essay", isEndangered: false }),
    ];
    expect(countEndangeredEssays(cards)).toBe(1);
  });

  it("detects mastered endangered essays", () => {
    const essay = masteredEssay();
    essay.sections[0]!.state = SectionState.Review;
    essay.sections[0]!.stability = 40;
    essay.sections[0]!.difficulty = 2;
    essay.isEndangered = true;

    expect(isMasteredEndangeredEssay(essay)).toBe(true);
    expect(endangeredEssayTooltip(essay)).toBe(MASTERED_ENDANGERED_TOOLTIP);
  });

  it("uses default tooltip for non-mastered endangered essay", () => {
    const essay = makeCard({ type: "essay", isEndangered: true });
    expect(endangeredEssayTooltip(essay)).toBe(ENDANGERED_CONCEPT_LABEL);
  });
});

describe("CardMasteryStatusBadge", () => {
  it("shows full endangered label instead of Savladano", () => {
    const essay = masteredEssay();
    essay.sections[0]!.state = SectionState.Review;
    essay.sections[0]!.stability = 40;
    essay.sections[0]!.difficulty = 2;
    essay.isEndangered = true;

    render(<CardMasteryStatusBadge card={essay} variant="full" />);
    expect(screen.getByText(ENDANGERED_CONCEPT_LABEL)).toBeInTheDocument();
    expect(screen.queryByText("Savladano")).not.toBeInTheDocument();
  });

  it("shows Savladano for mastered non-endangered essay", () => {
    const essay = masteredEssay();
    essay.sections[0]!.state = SectionState.Review;
    essay.sections[0]!.stability = 40;
    essay.sections[0]!.difficulty = 2;

    render(<CardMasteryStatusBadge card={essay} variant="compact" />);
    expect(screen.getByText("Savladano")).toBeInTheDocument();
  });

  it("shows compact Ugrožen label in table rows", () => {
    const essay = makeCard({ type: "essay", isEndangered: true });

    render(<CardMasteryStatusBadge card={essay} variant="compact" />);
    expect(screen.getByText(ENDANGERED_CONCEPT_SHORT)).toBeInTheDocument();
    expect(screen.queryByText(ENDANGERED_CONCEPT_LABEL)).not.toBeInTheDocument();
  });

  it("shows extended tooltip for mastered endangered essay", () => {
    const essay = masteredEssay();
    essay.sections[0]!.state = SectionState.Review;
    essay.sections[0]!.stability = 40;
    essay.sections[0]!.difficulty = 2;
    essay.isEndangered = true;

    render(<CardMasteryStatusBadge card={essay} variant="compact" />);
    expect(screen.getByTitle(MASTERED_ENDANGERED_TOOLTIP)).toBeInTheDocument();
  });
});

describe("EndangeredCountBadge", () => {
  it("renders nothing when count is zero", () => {
    const { container } = render(<EndangeredCountBadge count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders count for aggregate indicators", () => {
    render(<EndangeredCountBadge count={4} />);
    expect(screen.getByText("4")).toBeInTheDocument();
  });
});
