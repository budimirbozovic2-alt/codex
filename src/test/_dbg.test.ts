import { describe, it, expect } from "vitest";
import { BackupCardSchema } from "@/lib/migrations/backup-schema";
describe("dbg", () => {
  it("dump error", () => {
    const r = BackupCardSchema.safeParse({
      id: "c1", question: "Q", sections: [], categoryId: "cat1", type: "essay",
      frequencyTag: "INVALID",
    });
    if (!r.success) console.log("ISSUES:", JSON.stringify(r.error.issues, null, 2));
    expect(r.success).toBe(true);
  });
});
