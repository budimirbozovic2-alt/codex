/**
 * BootRecoveryGate — renderuje akcijabilan recovery UI kada boot padne u
 * `schema-error`, `load-error`, `version`, `blocked` ili `corrupted`. U
 * happy path-u (`idle | opening | schema | healing | loading | ready`)
 * samo prosljeđuje children.
 *
 * Zamjenjuje "bijeli ekran smrti" — korisnik uvijek dobije bar Retry +
 * Reset DB akciju.
 */
import { useCallback, type ReactNode } from "react";
import { useBootState } from "./BootStateProvider";
import { transition } from "@/lib/boot";
import { logger } from "@/lib/logger";

function reloadWindow() {
  try { window.location.reload(); } catch (e) { logger.warn("[boot-recovery] reload failed", e); }
}

async function resetDb() {
  if (!window.confirm("Brišem lokalnu bazu i restartujem aplikaciju. Podaci koji nisu backup-ovani biće izgubljeni. Nastaviti?")) return;
  try {
    const { db } = await import("@/lib/legacy/idb-dexie");
    db?.close();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase("codex");
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  } catch (e) {
    logger.error("[boot-recovery] resetDb failed", e);
  }
  reloadWindow();
}

function ErrorScreen({
  title, message, detail, actions,
}: { title: string; message: string; detail?: string; actions: ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg w-full rounded-xl border border-destructive/30 bg-card p-6 space-y-4 shadow-xl">
        <h1 className="text-xl font-semibold text-destructive">{title}</h1>
        <p className="text-sm text-foreground">{message}</p>
        {detail && (
          <pre className="text-[11px] text-muted-foreground bg-muted/40 p-3 rounded-md overflow-auto max-h-32 whitespace-pre-wrap">{detail}</pre>
        )}
        <div className="flex flex-wrap gap-2 pt-2">{actions}</div>
      </div>
    </div>
  );
}

export function BootRecoveryGate({ children }: { children: ReactNode }) {
  const state = useBootState();

  const retry = useCallback(() => {
    transition({ type: "RECOVERY_REQUESTED" });
    reloadWindow();
  }, []);

  if (state.type === "schema-error") {
    const causeMap: Record<string, string> = {
      version: "Verzija baze ne podudara se sa instaliranom aplikacijom. Vjerovatno je otvorena druga (starija/novija) verzija CODEX-a.",
      blocked: "Druga instanca CODEX-a drži bazu otključanom. Zatvorite druge prozore i pokušajte ponovo.",
      timeout: "Baza se nije otvorila u predviđenom vremenu (6s). Disk ili IndexedDB su zauzeti.",
      unknown: "Neuspješno otvaranje ili migracija lokalne baze.",
    };
    return (
      <ErrorScreen
        title="Greška pri inicijalizaciji baze"
        message={causeMap[state.cause] ?? causeMap.unknown}
        detail={state.message}
        actions={
          <>
            <button onClick={retry} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Pokušaj ponovo</button>
            <button onClick={resetDb} className="px-4 py-2 rounded-md border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10">Resetuj bazu</button>
          </>
        }
      />
    );
  }

  if (state.type === "load-error" || state.type === "corrupted") {
    return (
      <ErrorScreen
        title={state.type === "corrupted" ? "Baza je korumpirana" : "Greška pri učitavanju"}
        message="Učitavanje podataka iz baze nije uspjelo. Možete pokušati ponovo, resetovati bazu, ili nastaviti sa praznim stanjem (samo za pregled)."
        detail={state.message}
        actions={
          <>
            <button onClick={retry} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Pokušaj ponovo</button>
            <button onClick={() => transition({ type: "READY" })} className="px-4 py-2 rounded-md border border-border text-foreground text-sm font-medium hover:bg-muted">Nastavi sa praznim stanjem</button>
            <button onClick={resetDb} className="px-4 py-2 rounded-md border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10">Resetuj bazu</button>
          </>
        }
      />
    );
  }

  if (state.type === "version") {
    return (
      <ErrorScreen
        title="Konflikt verzije baze"
        message="Aplikacija je starija od šeme baze. Ažurirajte CODEX ili resetujte lokalnu bazu."
        detail={state.message}
        actions={
          <>
            <button onClick={retry} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Pokušaj ponovo</button>
            <button onClick={resetDb} className="px-4 py-2 rounded-md border border-destructive/40 text-destructive text-sm font-medium hover:bg-destructive/10">Resetuj bazu</button>
          </>
        }
      />
    );
  }

  if (state.type === "blocked") {
    return (
      <ErrorScreen
        title="Baza je zauzeta"
        message={`Druga instanca CODEX-a drži bazu otključanom (${state.tabCount}). Zatvorite druge prozore i kliknite Pokušaj ponovo.`}
        actions={<button onClick={retry} className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Pokušaj ponovo</button>}
      />
    );
  }

  return <>{children}</>;
}
