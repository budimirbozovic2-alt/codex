import { describe, it, expect } from "vitest";
import { makeCard } from "@/test/factories";
import { SectionState, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import {
  collectLeechInboxItems,
  burySiblingSatelliteItems,
  postponeSection,
} from "@/lib/review/leech-inbox";
import { buildDueForecast } from "@/lib/review/due-forecast";
import {
  KNOWLEDGE_PROFILE_PRESETS,
  resolveEffectiveSrParams,
} from "@/domains/subjects/subject-settings";

describe("leech inbox", () => {
  it("collects leech sections across cards", () => {
    const leechCard = makeCard({
      id: "leech-1",
      sections: [{
        id: "s1",
        state: SectionState.Review,
        lapses: DEFAULT_SR_SETTINGS.leechThreshold,
        stability: 1,
        nextReview: Date.now(),
      }],
    });
    const okCard = makeCard({
      id: "ok-1",
      sections: [{
        id: "s2",
        state: SectionState.Review,
        lapses: 0,
        stability: 20,
        nextReview: Date.now(),
      }],
    });

    const items = collectLeechInboxItems([leechCard, okCard], DEFAULT_SR_SETTINGS);
    expect(items).toHaveLength(1);
    expect(items[0]!.card.id).toBe("leech-1");
  });

  it("postpones section nextReview by N days", () => {
    const now = 1_700_000_000_000;
    const card = makeCard({
      sections: [{
        id: "s1",
        state: SectionState.Review,
        nextReview: now,
        stability: 5,
      }],
    });
    const patched = postponeSection(card, "s1", 7, now);
    expect(patched.sections[0]!.nextReview).toBe(now + 7 * 24 * 60 * 60 * 1000);
  });

  it("buries sibling satellites after current index", () => {
    const parentId = "essay-1";
    const items = [
      { card: makeCard({ id: "essay-1", type: "essay" }) },
      { card: makeCard({ id: "f1", type: "flash", parentId }) },
      { card: makeCard({ id: "f2", type: "flash", parentId }) },
      { card: makeCard({ id: "other", type: "flash" }) },
    ];
    const buried = burySiblingSatelliteItems(items, parentId, "f1", 2);
    expect(buried.map((i) => i.card.id)).toEqual(["essay-1", "f1", "other"]);
  });
});

describe("due forecast", () => {
  it("buckets overdue into today and sums horizon", () => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const now = today.getTime();
    const past = now - 60_000;
    const inThreeDays = now + 3 * 24 * 60 * 60 * 1000;

    const cards = [
      makeCard({
        sections: [
          { id: "overdue", state: SectionState.Review, nextReview: past, stability: 3 },
          { id: "future", state: SectionState.Review, nextReview: inThreeDays, stability: 5 },
        ],
      }),
    ];

    const { days, totalUpcoming } = buildDueForecast(cards, 7, now);
    expect(days[0]!.count).toBeGreaterThanOrEqual(1);
    expect(days[3]!.count).toBeGreaterThanOrEqual(1);
    expect(totalUpcoming).toBeGreaterThanOrEqual(2);
  });
});

describe("knowledge profile presets", () => {
  it("applies memory preset via resolveEffectiveSrParams when saved", async () => {
    const { saveSubjectSettings, clearSubjectSettings } = await import(
      "@/domains/subjects/subject-settings"
    );
    const catId = "test-cat-fsrs-profile";
    await clearSubjectSettings(catId);
    await saveSubjectSettings(catId, {
      knowledgeProfile: "memory",
      ...KNOWLEDGE_PROFILE_PRESETS.memory,
    });

    const { targetRetention, srSettings } = resolveEffectiveSrParams(
      catId,
      DEFAULT_SR_SETTINGS,
    );
    expect(targetRetention).toBe(0.93);
    expect(srSettings.leechThreshold).toBe(4);

    await clearSubjectSettings(catId);
  });
});
