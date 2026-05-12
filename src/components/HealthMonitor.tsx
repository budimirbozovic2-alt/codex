import { Activity, Database, HardDrive, RefreshCw, FileText, Brain, Clock, BookOpen, MapPin, Layers, AlertTriangle, Trash2, ShieldCheck, Wand2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import RemapFromBackupDialog from "@/components/RemapFromBackupDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { useHealthMonitor } from "@/hooks/useHealthMonitor";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function iconForTable(name: string): ReactNode {
  switch (name) {
    case "Kartice": return <BookOpen className="h-3.5 w-3.5" />;
    case "Review Log": return <Clock className="h-3.5 w-3.5" />;
    case "Pomodoro Log": return <Activity className="h-3.5 w-3.5" />;
    case "Dnevnik": return <FileText className="h-3.5 w-3.5" />;
    case "Kalibracija": return <Brain className="h-3.5 w-3.5" />;
    case "Latencija": return <Clock className="h-3.5 w-3.5" />;
    case "Slippage": return <MapPin className="h-3.5 w-3.5" />;
    case "Aktivnosti": return <Activity className="h-3.5 w-3.5" />;
    case "Disciplina": return <Layers className="h-3.5 w-3.5" />;
    case "Izvori": return <FileText className="h-3.5 w-3.5" />;
    case "Mape uma": return <Brain className="h-3.5 w-3.5" />;
    default: return <Database className="h-3.5 w-3.5" />;
  }
}

export default function HealthMonitor() {
  const {
    report, loading, cleaning, healing, lastRefresh,
    refresh, cleanOrphans, healStaleLinks, clearCrashLog,
  } = useHealthMonitor();
  const [remapOpen, setRemapOpen] = useState(false);

  const tableStats = report?.tableStats ?? [];
  const idb = report?.storage.idb ?? null;
  const ls = report?.storage.ls ?? null;
  const orphans = report?.integrity.orphans ?? { count: 0, cardIds: [] };
  const staleSub = report?.integrity.staleSub ?? { count: 0, cardIds: [] };
  const staleChap = report?.integrity.staleChap ?? { count: 0, cardIds: [] };
  const crashLog = report?.crashLog ?? [];
  const totalRecords = tableStats.reduce((s, t) => s + t.count, 0);

  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Health Monitor
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => { void refresh(); }} disabled={loading}>
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
                  onClick={() => { void cleanOrphans(); }}
                  disabled={cleaning}
                >
                  <Trash2 className="h-3 w-3" />
                  {cleaning ? "Čišćenje..." : "Premjesti u prvu kategoriju"}
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
              <ShieldCheck className="h-4 w-4 text-success" />
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
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setRemapOpen(true)}
                    disabled={healing}
                  >
                    <Wand2 className="h-3 w-3" />
                    Remap iz backupa
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => { void healStaleLinks(); }}
                    disabled={healing}
                  >
                    <Trash2 className="h-3 w-3" />
                    {healing ? "Čišćenje…" : "Očisti zastarjele veze"}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Storage overview */}
        <div className="grid grid-cols-2 gap-3">
          {idb && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                IndexedDB
              </div>
              <p className="text-lg font-semibold">{formatBytes(idb.usage)}</p>
              <p className="text-[10px] text-muted-foreground">
                od {formatBytes(idb.quota)}
              </p>
              <Progress value={Math.min(100, (idb.usage / idb.quota) * 100)} className="h-1" />
            </div>
          )}
          {ls && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium">
                <Database className="h-3.5 w-3.5 text-warning" />
                localStorage
              </div>
              <p className="text-lg font-semibold">{formatBytes(ls.usedBytes)}</p>
              <p className="text-[10px] text-muted-foreground">
                od {formatBytes(ls.maxBytes)} ({ls.percent}%)
              </p>
              <Progress value={ls.percent} className="h-1" />
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
                  {iconForTable(t.name)}
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
              <Button variant="ghost" size="sm" onClick={clearCrashLog} className="h-6 text-[10px] gap-1">
                <Trash2 className="h-3 w-3" /> Očisti
              </Button>
            )}
          </div>
          {crashLog.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs">
              <ShieldCheck className="h-4 w-4 text-success" />
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
    <RemapFromBackupDialog
      open={remapOpen}
      onOpenChange={setRemapOpen}
      onApplied={() => { void refresh(); }}
    />
    </>
  );
}
