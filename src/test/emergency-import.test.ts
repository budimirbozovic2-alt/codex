import { describe, it, expect } from "vitest";
import {
  isLegacyEmergencyExport,
  convertEmergencyToParsedBackup,
  LEGACY_EMERGENCY_VERSION,
} from "@/lib/backup/emergency-import";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";
import { makeCard } from "./factories";

const CAT_ID = "33333333-3333-4333-8333-333333333333";
const CARD_ID = "44444444-4444-4444-8444-444444444444";

function legacyEmergency() {
  return {
    version: LEGACY_EMERGENCY_VERSION,
    type: "emergency-backup",
    timestamp: "2026-01-01T00:00:00.000Z",
    cards: [makeCard({ id: CARD_ID, categoryId: CAT_ID, question: "Hitno?" })],
    categories: [{
      id: CAT_ID,
      name: "Predmet",
      sortOrder: 0,
      subcategories: [],
    }],
    subcategories: {},
    sources: [],
    reviewLog: [],
    mindMaps: [],
    diary: [],
    calibrationLog: [],
    latencyLog: [],
    slippageLog: [],
    activityLog: [],
    disciplineLog: [],
    pomodoroLog: [],
  };
}

describe("emergency-import", () => {
  it("isLegacyEmergencyExport detects v5 emergency files", () => {
    expect(isLegacyEmergencyExport(legacyEmergency())).toBe(true);
    expect(isLegacyEmergencyExport({ version: 7, type: "full", cards: [] })).toBe(false);
    expect(isLegacyEmergencyExport({ version: 5, type: "full", cards: [] })).toBe(false);
  });

  it("convertEmergencyToParsedBackup upgrades to v7 ParsedBackup", () => {
    const parsed = convertEmergencyToParsedBackup(legacyEmergency());

    expect(parsed.version).toBe(BACKUP_SCHEMA_VERSION);
    expect(parsed.type).toBe("full");
    expect(parsed.cards).toHaveLength(1);
    expect(parsed.cards[0].question).toBe("Hitno?");
    expect(parsed.knowledgeBaseArticles).toEqual([]);
  });

  it("rejects non-emergency payloads", () => {
    expect(() => convertEmergencyToParsedBackup({ version: 2, type: "template" }))
      .toThrow(/nije legacy hitni backup/i);
  });
});

describe("emergency-export shape", () => {
  it("BACKUP_SCHEMA_VERSION is 7 for new exports", () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(7);
  });
});
