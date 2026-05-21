import { useEffect, useRef, useState } from "react";
import { SRSettings } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, arrayToMap, bumpMapVersion } from "@/lib/persist-queue";
import { type CategoryRecord } from "@/lib/db";
import { markBootStep } from "@/lib/boot-trace";
import {
  splashProgress,
  showSplashError,
  cleanupSplash,
  forceRemoveSplash,
  notifyElectronReady,
} from "./card-bootstrap/splash";
import { bootDb } from "./card-bootstrap/bootDb";
import { runMigrations } from "./card-bootstrap/runMigrations";
import { loadInitialData } from "./card-bootstrap/loadInitialData";
import { normalizeCategories } from "./card-bootstrap/normalizeCategories";

import { logger } from "@/lib/logger";
interface BootSetters {
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  setCategoryRecordsState: React.Dispatch<React.SetStateAction<CategoryRecord[]>>;
  setReviewLogState: React.Dispatch<React.SetStateAction<ReviewLogEntry[]>>;
  setSrSettingsState: React.Dispatch<React.SetStateAction<SRSettings>>;
  /** Ref-Delta mirror — synced once at boot to seed CRUD's in-place writes. */
  cardMapRef: React.MutableRefObject<CardMap>;
}

export function useCardBootstrap(setters: BootSetters) {
  const { setCardMapState, setCategoryRecordsState, setReviewLogState, setSrSettingsState, cardMapRef } = setters;
  const [ready, setReady] = useState(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    // OSIGURAČ: Ako se aplikacija ne učita za 8s, forsiraj 'ready' stanje
    const panicTimer = setTimeout(() => {
      setReady((currentReady) => {
        if (!currentReady) {
          logger.error("[boot] Panic timeout (8s)! Forsiram ready state.");
          forceRemoveSplash();
          return true;
        }
        return currentReady;
      });
    }, 8000);

    (async () => {
      try {
        const { ok } = await bootDb();
        if (!ok) return;

        await runMigrations();

        const { cards, catRecords, log, settings } = await loadInitialData();
        const { finalRecords } = await normalizeCategories({ cards, catRecords });

        splashProgress(85, "Finalizacija…");
        markBootStep("cards:data-load-done", `${cards.length} cards`);

        if (import.meta.env.DEV) logger.log("[boot:diag] setting state — cards:", cards.length, "categories:", finalRecords.length);
        const initialMap = arrayToMap(cards);
        cardMapRef.current = initialMap; // Seed Ref-Delta mirror once at boot
        setCardMapState(initialMap);
        bumpMapVersion();
        setCategoryRecordsState(finalRecords);
        setReviewLogState(log);
        setSrSettingsState(settings);

        splashProgress(100, "Spremno!");
        markBootStep("cards:ready");
      } catch (error) {
        logger.error("[boot] useCards init:failed", error);
        markBootStep("cards:init-error", error instanceof Error ? error.message : String(error));
        splashProgress(100, "Pokretanje sa rezervnim stanjem…");
        showSplashError(error instanceof Error ? error.message : "Neočekivana greška pri učitavanju podataka.");
      } finally {
        setReady(true);
        clearTimeout(panicTimer);
        cleanupSplash();
        notifyElectronReady();
      }
    })();

    return () => clearTimeout(panicTimer);
  }, []);

  return { ready };
}
