import { Activity, Database, HardDrive, RefreshCw, FileText, Brain, Clock, BookOpen, MapPin, Layers } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/db";
import { getStorageUsage } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
interface TableStat {
  name: string;
  count: number;
  icon: React.ReactNode;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function HealthMonitor() {
  const [tableStats, setTableStats] = useState<TableStat[]>([]);
  const [idbEstimate, setIdbEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [lsUsage, setLsUsage] = useState<{ usedBytes: number; maxBytes: number; percent: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

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

      // Storage estimate (navigator.storage API)
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        setIdbEstimate({ usage: est.usage || 0, quota: est.quota || 0 });
      }

      // Overall storage usage (IndexedDB via navigator.storage.estimate)
      setLsUsage(await getStorageUsage());
    } catch (err) {
      console.error("[health] refresh failed", err);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

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
      </CardContent>
    </Card>
  );
}
