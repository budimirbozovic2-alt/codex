/**
 * E2E: simulira puni tok uvoza/kreacije kartica preko pravog Radix Dialog-a
 * i verificira da `installBodyPointerEventsGuard` oslobodi `pointer-events: none`
 * na <body> nakon zatvaranja, tako da pozadinska UI ostaje klikabilna.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState, useRef } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import * as Dialog from "@radix-ui/react-dialog";
import { installBodyPointerEventsGuard } from "@/lib/body-pointer-events-guard";

const nextRaf = () =>
  new Promise<void>((r) => requestAnimationFrame(() => r()));

// Mimika Radix leak-a: kad se dijalog zatvori, Radix ponekad ostavi
// `pointer-events: none` na <body>. Harness to forsira da test uvijek
// reproducira problem koji guard rješava.
function leakBodyPointerEvents() {
  document.body.style.pointerEvents = "none";
}

type ImportHarnessProps = {
  onBackgroundClick: () => void;
  closeMode?: "button" | "escape";
  title: string;
};

function ImportHarness({
  onBackgroundClick,
  closeMode = "button",
  title,
}: ImportHarnessProps) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <button type="button" onClick={onBackgroundClick}>
        Pozadinski klik
      </button>

      <input
        ref={fileRef}
        type="file"
        aria-label="Uvoz fajla"
        onChange={() => setOpen(true)}
      />

      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) leakBodyPointerEvents();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content
            onEscapeKeyDown={() => {
              // close + leak biće okinut kroz onOpenChange
            }}
          >
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description>Tok uvoza/kreacije.</Dialog.Description>
            {closeMode === "button" ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  leakBodyPointerEvents();
                }}
              >
                Potvrdi uvoz
              </button>
            ) : (
              <span>Zatvori sa Escape</span>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

describe("card import/create flow → guard oslobađa body", () => {
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    dispose = installBodyPointerEventsGuard();
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    document.body.style.pointerEvents = "";
    document.body.removeAttribute("data-scroll-locked");
    cleanup();
  });

  it("uvoz iz fajla → potvrda → close → pozadinski klik prolazi", async () => {
    const onBg = vi.fn();
    render(<ImportHarness onBackgroundClick={onBg} title="Potvrdi uvoz" />);

    const file = new File([JSON.stringify([{ q: "a", a: "b" }])], "cards.json", {
      type: "application/json",
    });
    const input = screen.getByLabelText("Uvoz fajla") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const confirm = await screen.findByRole("button", { name: "Potvrdi uvoz" });
    fireEvent.click(confirm);

    // Body je leak-ovan; guard treba da ga očisti unutar jednog rAF tick-a.
    expect(document.body.style.pointerEvents).toBe("none");
    await nextRaf();
    await nextRaf();

    expect(document.body.style.pointerEvents).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Pozadinski klik" }));
    expect(onBg).toHaveBeenCalledTimes(1);
  });

  it("bulk uvoz → Escape zatvara → guard oslobađa body", async () => {
    const onBg = vi.fn();
    render(
      <ImportHarness
        onBackgroundClick={onBg}
        closeMode="escape"
        title="Uvezeno 12 kartica"
      />,
    );

    const file = new File(["x"], "bulk.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Uvoz fajla"), {
      target: { files: [file] },
    });

    await screen.findByText("Uvezeno 12 kartica");

    // Escape okida onOpenChange(false) → leak.
    fireEvent.keyDown(document.activeElement || document.body, {
      key: "Escape",
      code: "Escape",
    });

    await nextRaf();
    await nextRaf();

    expect(document.body.style.pointerEvents).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Pozadinski klik" }));
    expect(onBg).toHaveBeenCalledTimes(1);
  });

  it("kreacija single kartice → save → close → klik prolazi", async () => {
    const onBg = vi.fn();
    function CreateHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={onBg}>
            Lista kartica
          </button>
          <button type="button" onClick={() => setOpen(true)}>
            Nova kartica
          </button>
          <Dialog.Root
            open={open}
            onOpenChange={(n) => {
              setOpen(n);
              if (!n) leakBodyPointerEvents();
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay />
              <Dialog.Content>
                <Dialog.Title>Nova kartica</Dialog.Title>
                <input aria-label="Pitanje" defaultValue="" />
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    leakBodyPointerEvents();
                  }}
                >
                  Sačuvaj
                </button>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      );
    }

    render(<CreateHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Nova kartica" }));
    const input = await screen.findByLabelText("Pitanje");
    fireEvent.change(input, { target: { value: "Šta je obligacija?" } });
    fireEvent.click(screen.getByRole("button", { name: "Sačuvaj" }));

    expect(document.body.style.pointerEvents).toBe("none");
    await nextRaf();
    await nextRaf();
    expect(document.body.style.pointerEvents).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Lista kartica" }));
    expect(onBg).toHaveBeenCalledTimes(1);
  });
});
