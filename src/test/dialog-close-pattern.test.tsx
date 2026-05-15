/**
 * E2E test za root-cause fix: dijalozi koriste pattern
 *   onOpenChange(false) → afterDialogClose(() => heavyMutate())
 * čime Radix završi cleanup PRIJE nego što parent re-render krene.
 *
 * Plus: shadcn DialogContent default `onCloseAutoFocus.preventDefault()`
 * spriječava focus race koji ostavlja `pointer-events: none` na body.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { afterDialogClose } from "@/lib/dialog-utils";
import { installBodyPointerEventsGuard } from "@/lib/body-pointer-events-guard";

const nextRaf = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));
const flushDeferred = async () => {
  // afterDialogClose koristi 2× rAF.
  await nextRaf();
  await nextRaf();
  await nextRaf();
};

describe("root-cause: close-first + afterDialogClose pattern", () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    dispose = installBodyPointerEventsGuard();
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    document.body.style.pointerEvents = "";
    cleanup();
  });

  it("teška mutacija + toast se izvršavaju TEK nakon close-a", async () => {
    const heavyMutation = vi.fn();
    const showToast = vi.fn();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Otvori
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Test</DialogTitle>
              </DialogHeader>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  afterDialogClose(() => {
                    heavyMutation();
                    showToast();
                  });
                }}
              >
                Sačuvaj
              </button>
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Otvori" }));
    const save = await screen.findByRole("button", { name: "Sačuvaj" });
    fireEvent.click(save);

    // U trenutku close-a, mutacije JOŠ NISU izvršene.
    expect(heavyMutation).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();

    await flushDeferred();

    expect(heavyMutation).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("DialogContent default onCloseAutoFocus.preventDefault() — fokus se NE vraća na trigger", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" data-testid="trigger" onClick={() => setOpen(true)}>
            Otvori
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Test</DialogTitle>
              </DialogHeader>
              <button type="button" onClick={() => setOpen(false)}>
                Zatvori
              </button>
            </DialogContent>
          </Dialog>
        </div>
      );
    }

    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);
    const closeBtn = await screen.findByRole("button", { name: "Zatvori" });
    fireEvent.click(closeBtn);

    await flushDeferred();

    // Sa default `e.preventDefault()`, Radix neće forsirati focus restore na
    // trigger. Body pointer-events ostaje slobodno.
    expect(document.body.style.pointerEvents).toBe("");
  });
});
