/**
 * PR3 — Selector regresijski test.
 *
 * Cilj: kad Radix Dialog (jedina overlay biblioteka koja je trenutno u
 * projektu) promijeni naming svojih internih atributa,
 * `body-pointer-events-guard` više neće "vidjeti" otvoreni overlay i
 * watchdog će logovati ERROR u runtime-u.
 *
 * Test potvrdi da bar JEDAN od `OVERLAY_SELECTORS` match-uje DOM dok je
 * Dialog otvoren — ako pukne, `body-pointer-events-guard` mora biti
 * revidiran prije merge-a `bun update`.
 *
 * Napomena: selektori za AlertDialog (`role="alertdialog"`) i Vaul Drawer
 * (`data-vaul-drawer`) ostaju kao defense-in-depth ako neka buduća feature
 * povuče te biblioteke; ovaj test ih ne pokriva jer nisu u dependency tree-u.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import * as Dialog from "@radix-ui/react-dialog";
import { OVERLAY_SELECTORS } from "@/lib/body-pointer-events-guard";

function anyMatches(): boolean {
  return OVERLAY_SELECTORS.some((sel) => !!document.querySelector(sel));
}

describe("PR3 — body-pointer-events-guard OVERLAY_SELECTORS regresija", () => {
  it("Radix Dialog: bar jedan selektor match-uje otvoreni dijalog", () => {
    render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>t</Dialog.Title>
            <Dialog.Description>d</Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    expect(screen.getByText("t")).toBeTruthy();
    expect(anyMatches()).toBe(true);
  });

  it("nakon close-a: nijedan overlay selektor ne match-uje", () => {
    const { rerender } = render(
      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>t2</Dialog.Title>
            <Dialog.Description>d2</Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    expect(anyMatches()).toBe(true);
    rerender(
      <Dialog.Root open={false}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content>
            <Dialog.Title>t2</Dialog.Title>
            <Dialog.Description>d2</Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>,
    );
    expect(anyMatches()).toBe(false);
  });
});
