/**
 * Simulira Radix Dialog "pointer-events: none" leak na <body> nakon
 * zatvaranja dialoga (npr. AddCardDialog ili AutoSplitDialog) i provjerava
 * da globalni guard automatski oslobodi UI tako da je ponovo klikabilan.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { installBodyPointerEventsGuard } from "@/lib/body-pointer-events-guard";

function makeDialog(state: "open" | "closed"): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "dialog");
  el.setAttribute("data-state", state);
  document.body.appendChild(el);
  return el;
}

function nextRaf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

describe("body-pointer-events-guard", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.body.style.pointerEvents = "";
    installBodyPointerEventsGuard(); // idempotent
  });

  it("oslobađa <body> nakon što se zatvori jedini dialog (simulacija import-a)", async () => {
    const dialog = makeDialog("open");
    // Radix simulacija: dok je dialog otvoren, body je zaključan.
    document.body.style.pointerEvents = "none";

    // Korisnik završi import → dialog se zatvori → Radix cleanup zakaže.
    dialog.setAttribute("data-state", "closed");
    document.body.style.pointerEvents = "none"; // simulira leak

    await nextRaf();
    await nextRaf();

    expect(document.body.style.pointerEvents).toBe("");
  });

  it("ne dira <body> dok je još uvijek otvoren neki dialog", async () => {
    makeDialog("open");
    document.body.style.pointerEvents = "none";
    // Triggeruj observer izmjenom istog atributa.
    document.body.style.pointerEvents = "none";

    await nextRaf();
    await nextRaf();

    expect(document.body.style.pointerEvents).toBe("none");
  });

  it("UI element ostaje klikabilan nakon zatvaranja dialoga", async () => {
    const btn = document.createElement("button");
    let clicked = 0;
    btn.addEventListener("click", () => { clicked++; });
    document.body.appendChild(btn);

    const dialog = makeDialog("open");
    document.body.style.pointerEvents = "none";
    dialog.remove(); // dialog unmount
    document.body.style.pointerEvents = "none"; // leak

    await nextRaf();
    await nextRaf();

    btn.click();
    expect(clicked).toBe(1);
    expect(document.body.style.pointerEvents).toBe("");
  });
});
