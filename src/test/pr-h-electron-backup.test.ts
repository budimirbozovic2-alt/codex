import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(p), "utf-8");

describe("PR-H-BACKUP-IPC: Sigurnost bekapa i oporavak", () => {
  
  it("backup.cjs striktno zahtijeva assertTrustedSender (H-1)", () => {
    const src = read("electron/backup.cjs");
    expect(src).toMatch(/defaultAssertTrustedSender/);
    expect(src).toMatch(/throw new Error\(['"]CRITICAL:\s*assertTrustedSender/);
    expect(src).toMatch(/const guard = assertTrustedSender \|\| defaultAssertTrustedSender/);
  });

  it("window.cjs striktno zahtijeva assertTrustedSender (H-1)", () => {
    const src = read("electron/window.cjs");
    expect(src).toMatch(/defaultAssertTrustedSender/);
    expect(src).toMatch(/throw new Error\(['"]CRITICAL:\s*assertTrustedSender/);
    expect(src).toMatch(/const guard = assertTrustedSender \|\| defaultAssertTrustedSender/);
  });

  it("backup.cjs ima kumulativno ograničenje strimovanja (H-2)", () => {
    const src = read("electron/backup.cjs");
    expect(src).toMatch(/let activeStreamBytes = 0/);
    expect(src).toMatch(/activeStreamBytes \+= buf\.length/);
    expect(src).toMatch(/if\s*\(activeStreamBytes > MAX_STREAM_BYTES\)/);
  });

  it("backup.cjs sprečava curenje paralelnih strimova (H-3)", () => {
    const src = read("electron/backup.cjs");
    // Provjeravamo da li se stari fajl gasi prije otvaranja novog
    expect(src).toMatch(/if\s*\(activeStreamFile \|\| activeStreamPath\)\s*\{/);
    expect(src).toMatch(/await activeStreamFile\.close\(\)/);
  });

  it("window.cjs koristi token-based mehanizam za oporavak od pada (H-5)", () => {
    const src = read("electron/window.cjs");
    expect(src).toMatch(/let currentReadyToken = Symbol\(\)/);
    expect(src).toMatch(/const windowToken = Symbol\(\)/);
    expect(src).toMatch(/currentReadyToken = windowToken/);
    // Provjera da se listener blokira ako token nije validan
    expect(src).toMatch(/if\s*\(currentReadyToken !== windowToken\)\s*return/);
  });

  it("backup.cjs koristi formatirano UTC vrijeme za nazive fajlova (M-7)", () => {
    const src = read("electron/backup.cjs");
    expect(src).toMatch(/function formatBackupTimestamp/);
    expect(src).toMatch(/getUTCFullYear/);
    expect(src).toMatch(/Date\.UTC/);
  });

});