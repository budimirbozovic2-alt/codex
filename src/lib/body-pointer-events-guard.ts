/**
 * Globalni guard protiv Radix Dialog "pointer-events: none" leak-a na <body>.
 *
 * Radix DismissableLayer postavlja `pointer-events: none` na <body> dok je
 * dialog otvoren i čisti ga u cleanup-u. Kada se dialog zatvori istovremeno
 * sa mountovanjem drugog portala (npr. Sonner toast), cleanup-i se rasporede
 * van reda i `pointer-events: none` ostane — cijela aplikacija postaje
 * neklikabilna iako je vizuelno ispravna.
 *
 * Ovaj guard:
 *  1) Sluša promjene `style` atributa na <body> (MutationObserver).
 *  2) Ako je `pointer-events: none` postavljen ali NEMA otvorenog
 *     `[role="dialog"][data-state="open"]` u DOM-u — uklanja ga.
 *  3) Drži i mali rAF "self-heal" trigger nakon svakog Radix
 *     `data-state="closed"` događaja u slučaju da MutationObserver
 *     promaši zbog batch-anja.
 */
let installed = false;

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

export function installBodyPointerEventsGuard(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const observer = new MutationObserver(() => {
    // Defer one frame: dialog cleanup i toast mount često padnu u isti tick.
    requestAnimationFrame(clearIfStuck);
  });

  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["style"],
  });

  // Dodatni safety net: kad bilo koji Radix overlay pređe u closed state,
  // pokušaj očistiti body nakon dva frame-a (dovoljno za sve cleanup-e).
  document.addEventListener(
    "animationend",
    (e) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute("data-state") === "closed") {
        requestAnimationFrame(() => requestAnimationFrame(clearIfStuck));
      }
    },
    true,
  );
}
