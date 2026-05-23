/**
 * Splash bridge + boot telemetrija.
 *
 * Subscribuje se na bootStateMachine i:
 *   1. mapira fazu u splash DOM (pct + label) — single source of truth
 *      umjesto raspršenih `splashProgress()` poziva u orchestratoru.
 *   2. emituje `boot:phase:enter` / `boot:phase:exit` u `markBootStep`
 *      sa duration-om — daje prirodan waterfall pri debug-u.
 *   3. okida `cleanupSplash` na `ready | schema-error | load-error`.
 *
 * Mountuje se jednom (idempotentno) iz `useCardBootstrap` prije nego što
 * orchestrator krene.
 */
import { subscribeBootState, getBootState, type BootPhase } from "./bootStateMachine";
import { markBootStep } from "@/lib/boot-trace";
import { cleanupSplash, splashProgress } from "@/hooks/card-bootstrap/splash";

let _installed = false;

export function installSplashBridge(): void {
  if (_installed) return;
  _installed = true;

  let prevPhase: BootPhase["type"] = getBootState().type;
  let phaseEnteredAt = performance.now();
  // Emit početni phase enter (uglavnom "idle"/"opening")
  markBootStep(`boot:phase:enter:${prevPhase}`);

  subscribeBootState(() => {
    const s = getBootState();

    // 1. Mapiraj fazu u splash DOM
    switch (s.type) {
      case "opening":
        splashProgress(5, "Otvaranje baze…");
        break;
      case "schema":
        // schema pct 0..100 → 10..40 u splash
        splashProgress(10 + Math.round(s.pct * 0.3), s.label || "Schema upgrade…");
        break;
      case "loading":
        // loading pct 0..100 → 40..90
        splashProgress(40 + Math.round(s.pct * 0.5), s.label || "Učitavanje…");
        break;
      case "healing":
        splashProgress(85, s.label || "Provjera integriteta…");
        break;
      case "ready":
        splashProgress(100, "Spremno!");
        cleanupSplash();
        break;
      case "schema-error":
      case "load-error":
      case "corrupted":
      case "version":
      case "blocked":
        // Recovery UI preuzima — sklonimo splash da se vidi.
        cleanupSplash();
        break;
    }

    // 2. Phase enter/exit telemetrija (samo pri promjeni tipa)
    if (s.type !== prevPhase) {
      const duration = Math.round(performance.now() - phaseEnteredAt);
      markBootStep(`boot:phase:exit:${prevPhase}`, `${duration}ms`);
      markBootStep(`boot:phase:enter:${s.type}`);
      // Ako healing završi sa skipped[] — log degradacije
      if (prevPhase === "healing") {
        const prevState = _lastHealing;
        if (prevState && prevState.skipped.length > 0) {
          markBootStep("boot:heal-degraded", prevState.skipped.join(","));
        }
      }
      prevPhase = s.type;
      phaseEnteredAt = performance.now();
    }

    if (s.type === "healing") {
      _lastHealing = { skipped: s.skipped };
    }
  });
}

let _lastHealing: { skipped: string[] } | null = null;

/** Test-only reset. */
export function __resetSplashBridgeForTests(): void {
  _installed = false;
  _lastHealing = null;
}
