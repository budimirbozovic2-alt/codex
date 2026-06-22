import { describe, expect, it, vi } from "vitest";
import {
  abortAuthoritativeWrite,
  finalizeAuthoritativeWrite,
  runAuthoritativeWrite,
  startAuthoritativeWrite,
} from "@/lib/query/authoritative-write";

describe("authoritative-write", () => {
  it("finalizeAuthoritativeWrite marks session committed on success", async () => {
    const session = startAuthoritativeWrite(() => 1);
    const commit = vi.fn(async () => 5);
    const abort = vi.fn(async () => 0);

    const count = await finalizeAuthoritativeWrite(session, commit, abort);
    expect(count).toBe(5);
    expect(session.committed).toBe(true);
    expect(abort).not.toHaveBeenCalled();
  });

  it("finalizeAuthoritativeWrite aborts on stale generation", async () => {
    const session = startAuthoritativeWrite(() => 2);
    const commit = vi.fn(async () => -1);
    const abort = vi.fn(async () => 3);

    await expect(
      finalizeAuthoritativeWrite(session, commit, abort),
    ).rejects.toThrow(/stale generation/i);
    expect(abort).toHaveBeenCalled();
    expect(session.committed).toBe(false);
  });

  it("runAuthoritativeWrite aborts when work throws", async () => {
    const abort = vi.fn(async () => 0);
    await expect(
      runAuthoritativeWrite(
        () => 1,
        async () => 1,
        abort,
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow(/boom/);
    expect(abort).toHaveBeenCalled();
  });

  it("abortAuthoritativeWrite is no-op after commit", async () => {
    const session = startAuthoritativeWrite(() => 1);
    session.committed = true;
    const abort = vi.fn(async () => 0);
    await abortAuthoritativeWrite(session, abort);
    expect(abort).not.toHaveBeenCalled();
  });
});
