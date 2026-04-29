import { Activity, Database, HardDrive, RefreshCw, FileText, Brain, Clock, BookOpen, MapPin, Layers, AlertTriangle, Trash2, ShieldCheck, Wand2 } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import RemapFromBackupDialog from "@/components/RemapFromBackupDialog";
import { db } from "@/lib/db";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { getStorageUsage } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

interface TableStat {
  name: string;
  count: number;
  icon: React.ReactNode;
}

interface OrphanResult {
  count: number;
  cardIds: string[];
}

interface CrashEntry {
  label: string;
  message: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function loadCrashLog(): CrashEntry[] {
  try {
    const raw = localStorage.getItem("codex-crash-log") || localStorage.getItem("memoria-crash-log");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function HealthMonitor() {
  const [tableStats, setTableStats] = useState<TableStat[]>([]);
  const [idbEstimate, setIdbEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [lsUsage, setLsUsage] = useState<{ usedBytes: number; maxBytes: number; percent: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [orphans, setOrphans] = useState<OrphanResult>({ count: 0, cardIds: [] });
  const [staleSub, setStaleSub] = useState<OrphanResult>({ count: 0, cardIds: [] });
  const [staleChap, setStaleChap] = useState<OrphanResult>({ count: 0, cardIds: [] });
  const [cleaning, setCleaning] = useState(false);
  const [healing, setHealing] = useState(false);
  const [crashLog, setCrashLog] = useState<CrashEntry[]>(loadCrashLog());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cards, reviewLog, pomodoroLog, diary, calibration, latency, slippage, activity, discipline, sources, mindMaps] = await Promise.all([
        db.cards.count(),
        db.reviewLog.count(),
        db.pomodoroLog.count(),
        db.diary.count(),
        db.calibrationLog.count(),
        db.latencyLog.count(),
        db.slippageLog.count(),
        db.activityLog.count(),
        db.disciplineLog.count(),
        db.sources.count(),
        db.mindMaps.count(),
      ]);

      setTableStats([
        { name: "Kartice", count: cards, icon: <BookOpen className="h-3.5 w-3.5" /> },
        { name: "Review Log", count: reviewLog, icon: <Clock className="h-3.5 w-3.5" /> },
        { name: "Pomodoro Log", count: pomodoroLog, icon: <Activity className="h-3.5 w-3.5" /> },
        { name: "Dnevnik", count: diary, icon: <FileText className="h-3.5 w-3.5" /> },
        { name: "Kalibracija", count: calibration, icon: <Brain className="h-3.5 w-3.5" /> },
        { name: "Latencija", count: latency, icon: <Clock className="h-3.5 w-3.5" /> },
        { name: "Slippage", count: slippage, icon: <MapPin className="h-3.5 w-3.5" /> },
        { name: "Aktivnosti", count: activity, icon: <Activity className="h-3.5 w-3.5" /> },
        { name: "Disciplina", count: discipline, icon: <Layers className="h-3.5 w-3.5" /> },
        { name: "Izvori", count: sources, icon: <FileText className="h-3.5 w-3.5" /> },
        { name: "Mape uma", count: mindMaps, icon: <Brain className="h-3.5 w-3.5" /> },
      ]);

      // Storage
      const storageResult = await getStorageUsage();
      setIdbEstimate({ usage: storageResult.usedBytes, quota: storageResult.maxBytes });
      setLsUsage(storageResult);

      // Orphan detection
      const [allCards, allCategories] = await Promise.all([
        db.cards.toArray(),
        db.categories.toArray(),
      ]);
      const validIds = new Set(allCategories.map(c => c.id));
      const orphanCards = allCards.filter(c => c.categoryId && !validIds.has(c.categoryId));
      setOrphans({ count: orphanCards.length, cardIds: orphanCards.map(c => c.id) });

      // Stale subcategoryId / chapterId detection
      const subUuids = new Set<string>();
      const chapUuids = new Set<string>();
      const chapToSub = new Map<string, string>();
      for (const cat of allCategories) {
        for (const sub of cat.subcategories ?? []) {
          subUuids.add(sub.id);
          for (const ch of sub.chapters ?? []) {
            if (typeof ch === "object" && ch.id) {
              chapUuids.add(ch.id);
              chapToSub.set(ch.id, sub.id);
            }
          }
        }
      }
      const staleSubCards = allCards.filter(c => c.subcategoryId && !subUuids.has(c.subcategoryId));
      const staleChapCards = allCards.filter(c => {
        if (!c.chapterId) return false;
        if (!chapUuids.has(c.chapterId)) return true;
        // mismatch: chapter exists but belongs to a different sub
        if (c.subcategoryId && subUuids.has(c.subcategoryId) && chapToSub.get(c.chapterId) !== c.subcategoryId) return true;
        return false;
      });
      setStaleSub({ count: staleSubCards.length, cardIds: staleSubCards.map(c => c.id) });
      setStaleChap({ count: staleChapCards.length, cardIds: staleChapCards.map(c => c.id) });

      // Crash log
      setCrashLog(loadCrashLog());
    } catch (err) {
      console.error("[health] refresh failed", err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCleanOrphans = async () => {
    if (orphans.count === 0) return;
    setCleaning(true);
    try {
      const categories = await db.categories.toArray();
      if (categories.length === 0) {
        toast.error("Nema kategorija za premještanje kartica");
        return;
      }
      const fallbackId = categories[0].id;
      await Promise.all(
        orphans.cardIds.map(id => db.cards.update(id, { categoryId: fallbackId, subcategoryId: "", chapterId: "" }))
      );
      toast.success(`${orphans.count} kartica premješteno u "${categories[0].name}"`);
      setOrphans({ count: 0, cardIds: [] });
      eventBus.emit(EVENT_TYPES.CARDS_UPDATED);
    } catch (err) {
      console.error("[health] cleanup failed", err);
      toast.error("Greška pri čišćenju");
    } finally {
      setCleaning(false);
    }
  };

  const handleHealStaleLinks = async () => {
    if (staleSub.count === 0 && staleChap.count === 0) return;
    setHealing(true);
    try {
      const { healCardTaxonomy } = await import("@/lib/migrations/heal-card-taxonomy");
      const report = await healCardTaxonomy(true);
      const total = report.staleSubcategoryReset + report.staleChapterReset + report.mismatchChapterReset;
      toast.success(`${total} zastarjelih veza očišćeno`);
      setStaleSub({ count: 0, cardIds: [] });
      setStaleChap({ count: 0, cardIds: [] });
      eventBus.emit(EVENT_TYPES.CARDS_UPDATED);
      await refresh();
    } catch (err) {
      console.error("[health] heal failed", err);
      toast.error("Greška pri čišćenju zastarjelih veza");
    } finally {
      setHealing(false);
    }
  };

  const handleClearCrashLog = () => {
    localStorage.removeItem("codex-crash-log");
    localStorage.removeItem("memoria-crash-log");
    setCrashLog([]);
    toast.success("Error log očišćen");
  };

  const totalRecords = tableStats.reduce((s, t) => s + t.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Health Monitor
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Zadnji refresh: {lastRefresh.toLocaleTimeString("sr-Latn")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Data Integrity — Orphan Detection */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Integritet podataka</p>
          {orphans.count > 0 ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                Orphan kartice
                <Badge variant="destructive" className="text-[10px]">{orphans.count}</Badge>
              </AlertTitle>
              <AlertDescription className="text-xs">
                {orphans.count} kartica pripada nepostojećoj kategoriji.
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5"
                  onClick={handleCleanOrphans}
                  disabled={cleaning}
                >
                  <Trash2 className="h-3 w-3" />
                  {cleaning ? "Čišćenje..." : "Premjesti u prvu kategoriju"}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
              <ShieldCheck className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Nema orphan zapisa — podaci su konzistentni</span>
            </div>
          )}

          {(staleSub.count > 0 || staleChap.count > 0) && (
            <Alert className="border-warning/50 bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertTitle className="flex items-center gap-2 text-warning">
                Zastarjele veze sa strukturom
                <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
                  {staleSub.count + staleChap.count}
                </Badge>
              </AlertTitle>
              <AlertDescription className="text-xs space-y-1">
                {staleSub.count > 0 && (
                  <div>{staleSub.count} kartica ima podkategoriju koja više ne postoji.</div>
                )}
                {staleChap.count > 0 && (
                  <div>{staleChap.count} kartica ima glavu koja ne postoji ili pripada drugoj podkategoriji.</div>
                )}
                <div className="text-muted-foreground pt-1">
                  Nakon čišćenja, ove kartice ostaju u svojoj kategoriji ali postaju "Neraspoređene"
                  — možeš ih premjestiti drag & drop-om u Org modu.
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-1.5"
                  onClick={handleHealStaleLinks}
                  disabled={healing}
                >
                  <Trash2 className="h-3 w-3" />
                  {healing ? "Čišćenje…" : "Očisti zastarjele veze"}
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Storage overview */}
        <div className="grid grid-cols-2 gap-3">
          {idbEstimate && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                IndexedDB
              </div>
              <p className="text-lg font-semibold">{formatBytes(idbEstimate.usage)}</p>
              <p className="text-[10px] text-muted-foreground">
                od {formatBytes(idbEstimate.quota)}
              </p>
              <Progress value={Math.min(100, (idbEstimate.usage / idbEstimate.quota) * 100)} className="h-1" />
            </div>
          )}
          {lsUsage && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Database className="h-3.5 w-3.5 text-warning" />
                localStorage
              </div>
              <p className="text-lg font-semibold">{formatBytes(lsUsage.usedBytes)}</p>
              <p className="text-[10px] text-muted-foreground">
                od {formatBytes(lsUsage.maxBytes)} ({lsUsage.percent}%)
              </p>
              <Progress value={lsUsage.percent} className="h-1" />
            </div>
          )}
        </div>

        {/* Total records */}
        <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between">
          <span className="text-xs font-medium">Ukupno zapisa</span>
          <span className="text-lg font-semibold text-primary">{totalRecords.toLocaleString()}</span>
        </div>

        {/* Per-table breakdown */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground mb-2">Po tabelama</p>
          <div className="grid grid-cols-2 gap-1.5">
            {tableStats.map(t => (
              <div key={t.name} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {t.icon}
                  {t.name}
                </span>
                <span className="font-medium tabular-nums">{t.count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Error Log */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Error Log</p>
            {crashLog.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleClearCrashLog} className="h-6 text-[10px] gap-1">
                <Trash2 className="h-3 w-3" /> Očisti
              </Button>
            )}
          </div>
          {crashLog.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
              <ShieldCheck className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Nema zabilježenih grešaka</span>
            </div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {crashLog.slice().sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || "")).map((entry, i) => (
                <div key={i} className="rounded-md border px-2.5 py-2 text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <Badge variant="destructive" className="text-[10px]">{entry.label}</Badge>
                      {(entry.count || 1) > 1 && (
                        <Badge variant="outline" className="text-[10px]">×{entry.count}</Badge>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {entry.lastSeen ? new Date(entry.lastSeen).toLocaleDateString("sr-Latn") : "—"}
                    </span>
                  </div>
                  <p className="text-muted-foreground truncate">{entry.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
