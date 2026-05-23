/**
 * Globalni guard protiv Radix Dialog "pointer-events: none" leak-a na <body>.
 *
 * Body se NE oslobađa ako bilo koji aktivni overlay i dalje treba lock:
 *   - Radix Dialog/Sheet:        [role="dialog"][data-state="open"]
 *   - Radix AlertDialog:         [role="alertdialog"][data-state="open"]
 *   - Vaul Drawer:               [data-vaul-drawer][data-state="open"]
 *   - Bilo koji aktivni Radix
 *     FocusScope guard:          [data-radix-focus-guard]
 *     (postoji jedan par po otvorenom dismissable layer-u — pouzdan
 *     indikator čak i za nested/stacked dijaloge)
 *   - react-remove-scroll lock:  body[data-scroll-locked]
 *
 * Throttle: jedan provjeri-i-očisti tick po frame-u (rAF coalesced).
 *
 * PR3 — Watchdog (~300ms): ako `body.style.pointerEvents === "none"` ostane
 * postavljeno bez ijednog aktivnog overlay-a, loguje se ERROR. To je signal
 * da je neka od upstream biblioteka (Radix/Vaul/react-remove-scroll)
 * promijenila atribute koje gore selektujemo — selectorRegistry više nije
 * tačan i guard mora biti revidiran.
 */
import { logger } from "@/lib/logger";

let installed: { dispose: () => void } | null = null;

const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[data-vaul-drawer][data-state="open"]',
  "[data-radix-focus-guard]",
].join(",");

export function isOverlayOpen(): boolean {
  if (typeof document === "undefined") return false;
  if (document.body.hasAttribute("data-scroll-locked")) return true;
  return !!document.querySelector(OPEN_OVERLAY_SELECTOR);
}

function clearIfStuck() {
  const body = document.body;
  if (!body) return;
  if (body.style.pointerEvents === "none" && !isOverlayOpen()) {
    body.style.pointerEvents = "";
  }
}


export function installBodyPointerEventsGuard(): () => void {
  if (typeof document === "undefined") return () => {};
  if (installed) return installed.dispose;

  let rafId: number | null = null;
  const schedule = () => {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      clearIfStuck();
    });
  };

  // Posmatraj body style (gdje Radix lock-uje pointer-events) + body atribute
  // (gdje react-remove-scroll skida `data-scroll-locked` pri unlock-u).
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["style", "data-scroll-locked"],
  });

  // Dodatni observer na cijelo stablo prati pojavu/nestanak focus-guard
  // node-ova (svaki Radix dismissable layer ih mountuje u par). Ovo hvata
  // tačan trenutak kada se posljednji nested overlay zatvori.
  const treeObserver = new MutationObserver((muts) => {
    // jsdom teardown može ukloniti `HTMLElement` reference prije nego mutation
    // queue isprazni — guard mora biti tolerantan na to.
    if (typeof HTMLElement === "undefined") return;
    for (const m of muts) {
      for (const n of m.removedNodes) {
        if (
          n instanceof HTMLElement &&
          (n.hasAttribute("data-radix-focus-guard") ||
            n.querySelector?.("[data-radix-focus-guard]"))
        ) {
          schedule();
          return;
        }
      }
    }
  });
  treeObserver.observe(document.body, { childList: true, subtree: true });

  const onAnimationEnd = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || typeof t.getAttribute !== "function") return;
    if (t.getAttribute("data-state") === "closed") schedule();
  };
  document.addEventListener("animationend", onAnimationEnd, true);

  const dispose = () => {
    observer.disconnect();
    treeObserver.disconnect();
    document.removeEventListener("animationend", onAnimationEnd, true);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    installed = null;
  };

  installed = { dispose };
  return dispose;
}
