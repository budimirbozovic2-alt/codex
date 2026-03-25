import { useCallback } from "react";
import { toast } from "sonner";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { ReviewLogEntry, setLastBackupTime } from "@/lib/storage";

function downloadFile(blob: Blob, filename: string) {
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

  const dataAny = data as any;
  const cardsArr: any[] = dataAny.cards || [];
  const CHUNK = 500;
  const blobParts: (string | Blob)[] = [];

  const rest = { ...dataAny };
  delete rest.cards;
  const restJson = JSON.stringify(rest);
  blobParts.push(restJson.slice(0, -1) + ',"cards":[');

  for (let i = 0; i < cardsArr.length; i += CHUNK) {
    const chunk = cardsArr.slice(i, i + CHUNK);
    const prefix = i > 0 ? "," : "";
    blobParts.push(prefix + chunk.map((c: any) => JSON.stringify(c)).join(","));
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
  categories: string[];
  subcategories: Record<string, string[]>;
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
}

export function useCardExport({ cards, categories, subcategories, reviewLog, srSettings }: UseCardExportDeps) {
  const exportTemplate = useCallback(
    async (compress: boolean, onProgress: (p: number, msg: string) => void) => {
      const templateCards = cards.map((c) => ({
        id: c.id,
        question: c.question,
        sections: c.sections.map((s) => ({ title: s.title, content: s.content })),
        category: c.category,
        subcategory: c.subcategory || "",
        chapter: c.chapter || "",
        type: c.type,
        tags: c.tags || [],
      }));
      const data = { version: 2, type: "template", cards: templateCards, categories, subcategories };
      const dateStr = new Date().toISOString().slice(0, 10);

      const blob = await buildJsonChunked(data, onProgress);

      if (compress) {
        onProgress(85, "Kompresija...");
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        zip.file(`codex-template-${dateStr}.json`, blob);
        const zipBlob = await zip.generateAsync({
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        });
        onProgress(100, "Preuzimanje...");
        downloadFile(zipBlob, `codex-template-${dateStr}.zip`);
        toast.success("Template uspješno exportovan.");
      } else {
        onProgress(100, "Preuzimanje...");
        downloadFile(blob, `codex-template-${dateStr}.json`);
        toast.success("Template uspješno exportovan.");
      }
    },
    [cards, categories, subcategories],
  );

  const exportData = useCallback(
    async (compress: boolean, onProgress: (p: number, msg: string) => void) => {
      onProgress(5, "Učitavanje svih podataka...");
      const { db, idbLoadReviewLog: loadFullReviewLog } = await import("@/lib/db");
      const [
        sources, mindMaps, diary, calibrationLog, latencyLog,
        slippageLog, activityLog, disciplineLog, pomodoroLog, fullReviewLog,
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
      ]);

      const localStorageData: Record<string, any> = {};
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

      const data = {
        version: 4, type: "full",
        cards, categories, subcategories,
        reviewLog: fullReviewLog, srSettings,
        sources, mindMaps, diary, calibrationLog, latencyLog,
        slippageLog, activityLog, disciplineLog, pomodoroLog,
        localStorageData,
      };
      const dateStr = new Date().toISOString().slice(0, 10);

      const blob = await buildJsonChunked(data, onProgress);

      if (compress) {
        onProgress(85, "Kompresija...");
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        zip.file(`codex-backup-${dateStr}.json`, blob);
        const zipBlob = await zip.generateAsync({
          type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 },
        });
        onProgress(100, "Preuzimanje...");
        downloadFile(zipBlob, `codex-backup-${dateStr}.zip`);
        toast.success("Kompletni backup uspješno exportovan.");
      } else {
        onProgress(100, "Preuzimanje...");
        downloadFile(blob, `codex-backup-${dateStr}.json`);
        toast.success("Kompletni backup uspješno exportovan.");
      }
      setLastBackupTime();
    },
    [cards, categories, subcategories, reviewLog, srSettings],
  );

  return { exportData, exportTemplate };
}
