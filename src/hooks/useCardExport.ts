import { useCallback } from "react";
import { toast } from "sonner";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { setLastBackupTime } from "@/lib/storage";

const IPC_SIZE_LIMIT_MB = 50;

async function downloadFile(blob: Blob, filename: string): Promise<void> {
  const sizeMB = blob.size / (1024 * 1024);
  
  // Use native Electron save dialog if available
  if (window.electronAPI?.showSaveDialog) {
    if (sizeMB > IPC_SIZE_LIMIT_MB) {
      toast({ 
        title: "Upozorenje o veličini", 
        description: `ZIP fajl je prevelik (${sizeMB.toFixed(1)}MB) za direktan transfer. Optimizacija streaminga je u razvoju.`, 
        variant: "destructive" 
      });
      // Ovdje u budućnosti implementirati Node.js fs.createWriteStream na strani Main procesa 
      return;
    }

    const ext = filename.endsWith('.zip') ? 'zip' : 'json';
    const result = await window.electronAPI.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: ext === 'zip' ? 'ZIP Archive' : 'JSON File', extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return;
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
    }
    const base64 = btoa(binary);
    await window.electronAPI.saveFile(result.filePath, base64);
    return;
  }
  // Web fallback
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function buildJsonChunked(
  data: object,
  onProgress: (p: number, msg: string) => void,
): Promise<Blob> {
  onProgress(10, "Priprema podataka...");
  await new Promise((r) => setTimeout(r, 30));

  const dataAny = data as Record<string, unknown>;
  const cardsArr: unknown[] = (dataAny.cards as unknown[]) || [];
  const CHUNK = 500;
  const blobParts: (string | Blob)[] = [];

  const rest = { ...dataAny };
  delete rest.cards;
  const restJson = JSON.stringify(rest);
  blobParts.push(restJson.slice(0, -1) + ',"cards":[');

  for (let i = 0; i < cardsArr.length; i += CHUNK) {
    const chunk = cardsArr.slice(i, i + CHUNK);
    const prefix = i > 0 ? "," : "";
    blobParts.push(prefix + chunk.map((c: unknown) => JSON.stringify(c)).join(","));
    const pct = 10 + Math.round((i / Math.max(cardsArr.length, 1)) * 60);
    onProgress(pct, `Serijalizacija kartica... ${Math.min(i + CHUNK, cardsArr.length)}/${cardsArr.length}`);
    await new Promise((r) => setTimeout(r, 10));
  }

  blobParts.push("]}");
  onProgress(75, "Finalizacija...");
  await new Promise((r) => setTimeout(r, 20));

  return new Blob(blobParts, { type: "application/json" });
}

interface UseCardExportDeps {
  cards: Card[];
  srSettings: SRSettings;
}

function deriveSubMap(catRecords: { name: string; subcategories?: any[] }[]): Record<string, string[]> {
  const subMap: Record<string, string[]> = {};
  catRecords.forEach(r => {
    if (r.subcategories && r.subcategories.length > 0) {
      subMap[r.name] = r.subcategories.map((s: any) => typeof s === "string" ? s : s.name);
    }
  });
  return subMap;
}

export function useCardExport({ cards, srSettings }: UseCardExportDeps) {
  // H1 fix: Read fresh cards from IDB for templates too
  const exportTemplate = useCallback(
    async (compress: boolean, onProgress: (p: number, msg: string) => void) => {
      const { db } = await import("@/lib/db");
      const [allCards, catRecords] = await Promise.all([
        db.cards.toArray(),
        db.categories.orderBy('sortOrder').toArray(),
      ]);
      const freshCards = allCards.length > 0 ? allCards : cards;
      const templateCards = freshCards.map((c) => ({
        id: c.id,
        question: c.question,
        sections: c.sections.map((s) => ({ title: s.title, content: s.content })),
        categoryId: c.categoryId,
        subcategoryId: c.subcategoryId || "",
        chapterId: c.chapterId || "",
        type: c.type,
        tags: c.tags || [],
      }));
      const data = { version: 2, type: "template", cards: templateCards, categories: catRecords, subcategories: deriveSubMap(catRecords) };
      const dateStr = new Date().toISOString().slice(0, 10);

      const blob = await buildJsonChunked(data, onProgress);

      if (compress) {
        onProgress(85, "Kompresija...");
        const { compressToZip } = await import("@/lib/zip-service");
        const zipBlob = await compressToZip(`codex-template-${dateStr}.json`, blob);
        onProgress(100, "Preuzimanje...");
        downloadFile(zipBlob, `codex-template-${dateStr}.zip`);
        toast({ title: "Template uspješno exportovan." });
      } else {
        onProgress(100, "Preuzimanje...");
        downloadFile(blob, `codex-template-${dateStr}.json`);
        toast({ title: "Template uspješno exportovan." });
      }
    },
    [cards],
  );

  const exportData = useCallback(
    async (compress: boolean, onProgress: (p: number, msg: string) => void) => {
      onProgress(5, "Učitavanje svih podataka...");
      const { db, idbLoadReviewLog: loadFullReviewLog } = await import("@/lib/db");
      const [
        sources, mindMaps, diary, calibrationLog, latencyLog,
        slippageLog, activityLog, disciplineLog, pomodoroLog, fullReviewLog,
        catRecords,
      ] = await Promise.all([
        db.sources.toArray(),
        db.mindMaps.toArray(),
        db.diary.toArray(),
        db.calibrationLog.toArray(),
        db.latencyLog.toArray(),
        db.slippageLog.toArray(),
        db.activityLog.toArray(),
        db.disciplineLog.toArray(),
        db.pomodoroLog.toArray(),
        loadFullReviewLog(),
        db.categories.orderBy('sortOrder').toArray(),
      ]);

      const localStorageData: Record<string, unknown> = {};
      const lsKeys = [
        "sr-app-settings", "sr-mnemonic-workshop", "sr-mnemonic-associations",
        "sr-major-system-map", "sr-learn-progress", "sr-last-backup",
      ];
      for (const key of lsKeys) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          try { localStorageData[key] = JSON.parse(val); } catch { localStorageData[key] = val; }
        }
      }
      const [plannerConfig, dailyMapped, dailyMappedDate] = await Promise.all([
        db.settings.get("plannerConfig"),
        db.settings.get("dailyMapped"),
        db.settings.get("dailyMappedDate"),
      ]);
      if (plannerConfig?.value) localStorageData["sr-planner-config"] = plannerConfig.value;
      if (dailyMapped?.value != null) localStorageData["sr-daily-mapped-count"] = dailyMapped.value;
      if (dailyMappedDate?.value) localStorageData["sr-daily-mapped-date"] = dailyMappedDate.value;

      // H3 fix: Read cards fresh from IDB to avoid stale closure data
      const allCards = await db.cards.toArray();
      const freshCards = allCards.length > 0 ? allCards : cards; // fallback to prop if IDB empty

      const data = {
        version: 5, type: "full",
        cards: freshCards, categories: catRecords, subcategories: deriveSubMap(catRecords),
        reviewLog: fullReviewLog, srSettings,
        sources, mindMaps, diary, calibrationLog, latencyLog,
        slippageLog, activityLog, disciplineLog, pomodoroLog,
        localStorageData,
      };
      const dateStr = new Date().toISOString().slice(0, 10);

      const blob = await buildJsonChunked(data, onProgress);

      if (compress) {
        onProgress(85, "Kompresija...");
        const { compressToZip } = await import("@/lib/zip-service");
        const zipBlob = await compressToZip(`codex-backup-${dateStr}.json`, blob);
        onProgress(100, "Preuzimanje...");
        downloadFile(zipBlob, `codex-backup-${dateStr}.zip`);
        toast({ title: "Kompletni backup uspješno exportovan." });
      } else {
        onProgress(100, "Preuzimanje...");
        downloadFile(blob, `codex-backup-${dateStr}.json`);
        toast({ title: "Kompletni backup uspješno exportovan." });
      }
      setLastBackupTime();
    },
    [cards, srSettings],
  );

  return { exportData, exportTemplate };
}
