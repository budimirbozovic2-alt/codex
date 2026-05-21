import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import {
import { logger } from "@/lib/logger";
  buildHealthReport,
  cleanOrphans as svcCleanOrphans,
  clearCrashLog as svcClearCrashLog,
  healStaleLinks as svcHealStaleLinks,
  type HealthReport,
} from "@/lib/services/healthService";

export interface UseHealthMonitor {
  report: HealthReport | null;
  loading: boolean;
  cleaning: boolean;
  healing: boolean;
  lastRefresh: Date;
  refresh: () => Promise<void>;
  cleanOrphans: () => Promise<void>;
  healStaleLinks: () => Promise<void>;
  clearCrashLog: () => void;
}

export function useHealthMonitor(): UseHealthMonitor {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [healing, setHealing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await buildHealthReport();
      setReport(next);
    } catch (err) {
      logger.error("[health] refresh failed", err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const cleanOrphans = useCallback(async () => {
    if (!report || report.integrity.orphans.count === 0) return;
    setCleaning(true);
    const cardIds = report.integrity.orphans.cardIds;
    try {
      const result = await svcCleanOrphans(cardIds);
      toast.success(`${result.movedCount} kartica premješteno u "${result.fallbackCategoryName}"`);
      setReport(prev => prev ? {
        ...prev,
        integrity: { ...prev.integrity, orphans: { count: 0, cardIds: [] } },
      } : prev);
      eventBus.emit(EVENT_TYPES.CARDS_UPDATED, { source: "orphan-cleanup", cardIds });
    } catch (err) {
      logger.error("[health] cleanup failed", err);
      toast.error(err instanceof Error ? err.message : "Greška pri čišćenju");
    } finally {
      setCleaning(false);
    }
  }, [report]);

  const healStaleLinks = useCallback(async () => {
    if (!report) return;
    const { staleSub, staleChap } = report.integrity;
    if (staleSub.count === 0 && staleChap.count === 0) return;
    setHealing(true);
    try {
      const r = await svcHealStaleLinks();
      const total = r.staleSubcategoryReset + r.staleChapterReset + r.mismatchChapterReset;
      toast.success(`${total} zastarjelih veza očišćeno`);
      eventBus.emit(EVENT_TYPES.CARDS_UPDATED, {
        source: "heal-stale",
        cardIds: Array.from(new Set([...staleSub.cardIds, ...staleChap.cardIds])),
      });
      await refresh();
    } catch (err) {
      logger.error("[health] heal failed", err);
      toast.error("Greška pri čišćenju zastarjelih veza");
    } finally {
      setHealing(false);
    }
  }, [report, refresh]);

  const clearCrashLog = useCallback(() => {
    svcClearCrashLog();
    setReport(prev => prev ? { ...prev, crashLog: [] } : prev);
    toast.success("Error log očišćen");
  }, []);

  return { report, loading, cleaning, healing, lastRefresh, refresh, cleanOrphans, healStaleLinks, clearCrashLog };
}
