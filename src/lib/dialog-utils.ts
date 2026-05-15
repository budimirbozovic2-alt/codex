/**
 * Dialog close utilities — root-cause prevencija pointer-events leak-a.
 *
 * Problem: Pozivanje `setOpen(false)` zajedno sa teškim sinhronim mutacijama
 * parent state-a u istom tick-u uzrokuje race između Radix-ove cleanup logike
 * i React commit-a, pa `pointer-events: none` ostane na `<body>`.
 *
 * Rješenje: zatvori dijalog PRVO, pa side-effect izvrši nakon idućeg paint-a.
 * Dva rAF tick-a su empirijski dovoljna da Radix završi unmount + focus restore.
 */
export function afterDialogClose(fn: () => void): void {
  if (typeof requestAnimationFrame === "undefined") {
    // SSR / test: izvrši odmah.
    fn();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(fn));
}
