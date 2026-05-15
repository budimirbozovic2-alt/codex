/**
 * Globalni guard protiv Radix Dialog "pointer-events: none" leak-a na <body>.
 *
 * Radix DismissableLayer postavlja `pointer-events: none` na <body> dok je
 * dialog otvoren i čisti ga u cleanup-u. Kada se dialog zatvori istovremeno
 * sa mountovanjem drugog portala (npr. Sonner toast), cleanup-i se rasporede
 * van reda i `pointer-events: none` ostane — cijela aplikacija postaje
 * neklikabilna iako je vizuelno ispravna.
 *
 * Optimizacije:
 *  - MutationObserver se okida na `body[style]`, ali se sve provjere
 *    coalesce-uju u jedan rAF tick (throttle do 1× po frame-u).
 *  - `animationend` listener sluša samo overlay/content node-ove preko
 *    `data-state="closed"` filtera, sa istim rAF coalescing-om.
 *  - `installBodyPointerEventsGuard()` vraća `dispose()` koji uklanja
 *    observer + listener i otkazuje pending rAF.
 */
let installed: { dispose: () => void } | null = null;

function hasOpenOverlay(): boolean {
  return !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
  );
}

function clearIfStuck() {
  const body = document.body;
  if (!body) return;
  if (body.style.pointerEvents === "none" && !hasOpenOverlay()) {
    body.style.pointerEvents = "";
  }
}

export function installBodyPointerEventsGuard(): () => void {
  if (typeof document === "undefined") return () => {};
  if (installed) return installed.dispose;

  let rafId: number | null = null;
  const schedule = () => {
    if (rafId !== null) return; // throttle: jedan check po frame-u
    rafId = requestAnimationFrame(() => {
      rafId = null;
      clearIfStuck();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["style"],
  });

  const onAnimationEnd = (e: Event) => {
    const t = e.target as HTMLElement | null;
    if (!t || typeof t.getAttribute !== "function") return;
    if (t.getAttribute("data-state") === "closed") schedule();
  };
  document.addEventListener("animationend", onAnimationEnd, true);

  const dispose = () => {
    observer.disconnect();
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
