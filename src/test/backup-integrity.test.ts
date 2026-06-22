import { describe, it, expect } from "vitest";
import { makeCard } from "@/test/factories";
import {
  computeBackupIntegrityStats,
  buildExportMetadata,
  formatIntegritySummary,
  formatExportMetadataDiff,
} from "@/lib/backup/backup-integrity";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";

describe("backup integrity", () => {
  it("counts cards, saga links, endangered, and orphan parentId", () => {
    const essay = makeCard({ id: "e1", type: "essay", isEndangered: true });
    const sat = makeCard({
      id: "f1",
      type: "flash",
      parentId: essay.id,
    });
    const orphan = makeCard({
      id: "f2",
      type: "flash",
      parentId: "missing-parent",
    });

    const stats = computeBackupIntegrityStats([essay, sat, orphan]);
    expect(stats.cardCount).toBe(3);
    expect(stats.sagaLinkCount).toBe(2);
    expect(stats.endangeredCount).toBe(1);
    expect(stats.orphanParentIdCount).toBe(1);
    expect(formatIntegritySummary(stats)).toMatch(/3 kartica/);
  });

  it("builds export metadata for backup diff", () => {
    const cards = [
      makeCard({ id: "c1", type: "essay" }),
      makeCard({ id: "f1", type: "flash", parentId: "c1" }),
    ];
    const meta = buildExportMetadata(cards, BACKUP_SCHEMA_VERSION, 1_700_000_000_000);
    expect(meta.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(meta.sagaLinkCount).toBe(1);

    const older = { ...meta, cardCount: meta.cardCount - 2 };
    const diff = formatExportMetadataDiff(meta, older);
    expect(diff).toMatch(/\+2/);
  });
});
