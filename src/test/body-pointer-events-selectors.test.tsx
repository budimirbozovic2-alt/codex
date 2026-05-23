/**
 * PR3 — Selector regresijski test.
 *
 * Cilj: kad neka od upstream biblioteka (Radix Dialog, Vaul Drawer,
 * Radix AlertDialog) promijeni naming svojih internih atributa,
 * `body-pointer-events-guard` više neće "vidjeti" otvoreni overlay i
 * watchdog će logovati grešku u produkciji.
 *
 * Ovaj test mountuje realne primitive i potvrdi da bar JEDAN od
 * `OVERLAY_SELECTORS` match-uje DOM dok je overlay otvoren — ako pukne,
 * `body-pointer-events-guard` mora biti revidiran prije merge-a `bun update`.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Drawer } from "vaul";
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

  it("Radix AlertDialog: bar jedan selektor match-uje", () => {
    render(
      <AlertDialog.Root open>
        <AlertDialog.Portal>
          <AlertDialog.Overlay />
          <AlertDialog.Content>
            <AlertDialog.Title>at</AlertDialog.Title>
            <AlertDialog.Description>ad</AlertDialog.Description>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>,
    );
    expect(anyMatches()).toBe(true);
  });

  it("Vaul Drawer: bar jedan selektor match-uje", () => {
    render(
      <Drawer.Root open>
        <Drawer.Portal>
          <Drawer.Overlay />
          <Drawer.Content>
            <Drawer.Title>dt</Drawer.Title>
            <Drawer.Description>dd</Drawer.Description>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>,
    );
    expect(anyMatches()).toBe(true);
  });
});
