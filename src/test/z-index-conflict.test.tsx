import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import tailwindConfig from "../../tailwind.config";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import Modal from "@/components/ui/Modal";

beforeAll(() => {
  // jsdom polyfills required by Radix (Popover/Dialog) and storage modules.
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (typeof Element.prototype.scrollIntoView !== "function") {
    Element.prototype.scrollIntoView = function () {};
  }
  if (typeof window.HTMLElement.prototype.hasPointerCapture !== "function") {
    window.HTMLElement.prototype.hasPointerCapture = () => false;
  }
});


/**
 * Z-index conflict regression suite.
 *
 * Reproduces the historical bleed-through bug where Radix Dialog (z-50),
 * PlannerSetupWizard (z-modal-elevated = 60), and ZenMode controls
 * (z-zen = 110) all competed at z-50 and stacked by mount order rather than
 * by intent. Locks the centralized scale + per-component token usage so the
 * regression cannot return silently.
 */

type ZIndexScale = Record<string, string>;
const z = (tailwindConfig.theme?.extend?.zIndex ?? {}) as ZIndexScale;

const num = (token: string) => Number(z[token]);

describe("z-index scale (tailwind.config)", () => {
  it("defines all semantic overlay tokens", () => {
    for (const t of [
      "base", "dropdown", "modal", "modal-elevated",
      "search", "overlay", "zen", "recovery", "blocking",
    ]) {
      expect(z[t], `missing token z-${t}`).toBeDefined();
    }
  });

  it("orders overlays so higher-intent layers always win", () => {
    expect(num("base")).toBeLessThan(num("dropdown"));
    expect(num("dropdown")).toBeLessThan(num("modal"));
    // The exact bleed-through: custom modals MUST sit above Radix Dialog.
    expect(num("modal-elevated")).toBeGreaterThan(num("modal"));
    expect(num("search")).toBeGreaterThan(num("modal-elevated"));
    expect(num("overlay")).toBeGreaterThan(num("search"));
    // ZenMode's controls must beat every standard modal layer.
    expect(num("zen")).toBeGreaterThan(num("overlay"));
    expect(num("zen")).toBeGreaterThan(num("modal-elevated"));
    expect(num("zen")).toBeGreaterThan(num("modal"));
    expect(num("recovery")).toBeGreaterThan(num("zen"));
    expect(num("blocking")).toBeGreaterThan(num("recovery"));
  });
});

describe("overlay components apply the correct semantic z token", () => {
  it("Radix Dialog overlay + content render at z-50 (z-modal)", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Test</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    // Radix portals overlay+content into document.body
    const overlay = document.querySelector('[data-radix-dialog-overlay], [class*="z-50"]');
    expect(overlay, "Radix Dialog overlay should mount").toBeTruthy();
    const z50 = document.body.querySelectorAll('[class*="z-50"]');
    expect(z50.length).toBeGreaterThanOrEqual(1);
  });

  it("Modal shell uses z-modal-elevated by default and z-search when overridden", () => {
    const { rerender, unmount } = render(
      <MemoryRouter>
        <Modal open onClose={() => {}}>
          <div>elevated</div>
        </Modal>
      </MemoryRouter>,
    );
    expect(document.body.querySelector(".z-modal-elevated")).toBeTruthy();

    rerender(
      <MemoryRouter>
        <Modal open onClose={() => {}} zClassName="z-search">
          <div>search</div>
        </Modal>
      </MemoryRouter>,
    );
    expect(document.body.querySelector(".z-search")).toBeTruthy();
    unmount();
  });

  it("PlannerSetupWizard mounts above Radix Dialog (no backdrop bleed-through)", async () => {
    const Wizard = (await import("@/components/planner/PlannerSetupWizard")).default;
    render(
      <MemoryRouter>
        <Dialog open>
          <DialogContent>
            <DialogTitle>Behind</DialogTitle>
            <p>behind content</p>
          </DialogContent>
        </Dialog>
        <Wizard
          config={{
            finalGoalDate: null,
            dailyAvailableMinutes: 240,
            bufferPercent: 10,
            hardSubjects: [],
            subjectOrder: [],
          } as Parameters<typeof Wizard>[0]["config"]}
          save={() => {}}
          categoryRecords={[]}
          cards={[]}
          onClose={() => {}}
        />
      </MemoryRouter>,
    );

    const dialogLayer = document.body.querySelector('[class*="z-50"]');
    const wizardLayer = document.body.querySelector(".z-modal-elevated");
    expect(dialogLayer, "Radix Dialog must be mounted").toBeTruthy();
    expect(wizardLayer, "Planner wizard must use z-modal-elevated").toBeTruthy();
    // Numeric proof — wizard token > Radix token.
    expect(num("modal-elevated")).toBeGreaterThan(num("modal"));
  });

  it("ZenMode overlay sits at z-zen and beats every modal layer", async () => {
    const ZenMode = (await import("@/components/ZenMode")).default;
    render(<ZenMode active={true} onToggle={() => {}} />);
    const zen = document.body.querySelector(".z-zen");
    expect(zen, "ZenMode must render at z-zen").toBeTruthy();
    expect(num("zen")).toBeGreaterThan(num("modal"));
    expect(num("zen")).toBeGreaterThan(num("modal-elevated"));
    expect(num("zen")).toBeGreaterThan(num("search"));
  });
});
