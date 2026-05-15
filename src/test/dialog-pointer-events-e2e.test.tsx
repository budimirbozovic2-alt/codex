/**
 * E2E-style test: koristi pravu Radix Dialog komponentu da simulira tok
 * "kreiranje/uvoz kartice" → toast → close → klik na pozadinski UI.
 *
 * Provjerava da nakon zatvaranja dialoga (čak i ako body ima zaostali
 * `pointer-events: none`) globalni guard oslobodi UI i klik prolazi.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { installBodyPointerEventsGuard } from "@/lib/body-pointer-events-guard";

function nextRaf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function CardCreationHarness({ onBgClick }: { onBgClick: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button data-testid="bg" onClick={onBgClick}>
        pozadinski klik
      </button>
      <button data-testid="open" onClick={() => setOpen(true)}>
        otvori
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova kartica</DialogTitle>
          </DialogHeader>
          <button
            data-testid="save"
            onClick={() => {
              // Simulira Radix race: pri close-u ostane zaključan body.
              setOpen(false);
              document.body.style.pointerEvents = "none";
            }}
          >
            sačuvaj
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

describe("e2e: Radix dialog → klik na pozadinski UI", () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    document.body.style.pointerEvents = "";
    dispose = installBodyPointerEventsGuard();
  });

  afterEach(() => {
    cleanup();
    dispose?.();
    dispose = null;
    document.body.style.pointerEvents = "";
  });

  it("klik prolazi nakon kreiranja kartice (close + zaostali pointer-events:none)", async () => {
    let bgClicks = 0;
    render(<CardCreationHarness onBgClick={() => { bgClicks++; }} />);

    fireEvent.click(screen.getByTestId("open"));
    fireEvent.click(screen.getByTestId("save"));

    // Sačekaj 2 frame-a — guard radi unutar rAF coalesce-a.
    await act(async () => { await nextRaf(); await nextRaf(); });

    fireEvent.click(screen.getByTestId("bg"));
    expect(bgClicks).toBe(1);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("ne oslobađa body dok je dialog još uvijek otvoren", async () => {
    render(<CardCreationHarness onBgClick={() => { /* noop */ }} />);
    fireEvent.click(screen.getByTestId("open"));

    // Simuliraj otvoreni Radix lock.
    document.body.style.pointerEvents = "none";
    await act(async () => { await nextRaf(); await nextRaf(); });

    expect(document.body.style.pointerEvents).toBe("none");
  });

  it("dispose uklanja observer pa zaostali leak ostaje (sanity check)", async () => {
    dispose?.();
    dispose = null;

    document.body.style.pointerEvents = "none";
    await nextRaf();
    await nextRaf();

    expect(document.body.style.pointerEvents).toBe("none");
  });
});
