/**
 * Backward-compat shim — orchestrator je migrirao na `runSchema` + `runHeal`
 * razdvajanje. Postojeći (eksterni) konzumeri `runMigrations()` i dalje rade.
 */
import { runSchema } from "./runSchema";

/** @deprecated Use `runSchema()` + `runHeal()`. */
export async function runMigrations(): Promise<void> {
  await runSchema();
  // Napomena: heal koraci više nisu dio runMigrations — boot orchestrator
  // poziva runHeal POSLIJE loadInitialData (heal je post-load operacija).
}
