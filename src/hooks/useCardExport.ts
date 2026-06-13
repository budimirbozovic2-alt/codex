import { useCallback } from "react";
import { toast } from "sonner";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { setLastBackupTime } from "@/lib/storage";
import type { CategoryRecord } from "@/lib/db-types";
import { streamBackup, sourceSpec, type ProgressFn } from "@/lib/backup/export-stream";
import { deriveHtml } from "@/lib/editor-v4/derived";
import {
  readAllCardsForBackup,
  readAllCategoriesForBackup,
  readAllSourcesForBackup,
  readAllMindMapsForBackup,
  readAllKbArticlesForBackup,
  readAllMnemonicsForBackup,
  readAllMajorSystemForBackup,
  readAllMnemonicTestLogForBackup,
  readAllDisciplineLogForBackup,
  readReviewLog,
  readDiary,
  readCalibrationLog,
  readLatencyLog,
  readSlippageLog,
  readActivityLog,
  readPomodoroLog,
  readSettingsTableRaw,
} from "@/lib/db/queries";

const IPC_BASE64_LIMIT_MB = 50;
const IPC_BYTES_LIMIT_MB = 500;

async function downloadFile(blob: Blob, filename: string): Promise<{ saved: boolean }> {
  const sizeMB = blob.size / (1024 * 1024);

  if (window.electronAPI?.showSaveDialog) {
    const ext = filename.endsWith(".zip") ? "zip" : "json";
    const result = await window.electronAPI.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: ext === "zip" ? "ZIP Archive" : "JSON File", extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };

    // Prefer the binary IPC path: no base64 expansion, no payload-sized
    // string allocation in the renderer, and a 500 MB cap.
    if (window.electronAPI.saveFileBytes) {
      if (sizeMB > IPC_BYTES_LIMIT_MB) {
        throw new Error(`Fajl je prevelik (${sizeMB.toFixed(1)}MB). Maksimum za direktan transfer je ${IPC_BYTES_LIMIT_MB}MB.`);
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const ok = await window.electronAPI.saveFileBytes(result.filePath, bytes);
      return { saved: !!ok };
    }

    // Legacy base64 fallback (older preload).
    if (sizeMB > IPC_BASE64_LIMIT_MB) {
      throw new Error(`Fajl je prevelik (${sizeMB.toFixed(1)}MB). Maksimum za direktan transfer je ${IPC_BASE64_LIMIT_MB}MB. Pokušajte bez ZIP kompresije ili izvezite po predmetu.`);
    }
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
    }
    const base64 = btoa(binary);
    await window.electronAPI.saveFile(result.filePath, base64);
    return { saved: true };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { saved: true };
}

interface UseCardExportDeps {
  srSettings: SRSettings;
}

function deriveSubMap(catRecords: CategoryRecord[]): Record<string, string[]> {
  const subMap: Record<string, string[]> = {};
  for (const r of catRecords) {
    if (r.subcategories.length > 0) {
      subMap[r.name] = r.subcategories.map((s) => s.name);
    }
  }
  return subMap;
}

// Projection helper for template export — templates carry a minimal card shape.
function projectCardToTemplate(c: Card) {
  return {
    id: c.id,
    question: c.question,
    sections: c.sections.map((s) => ({ title: s.title, content: deriveHtml(s.contentDoc) })),
    categoryId: c.categoryId,
    subcategoryId: c.subcategoryId || "",
    chapterId: c.chapterId || "",
    type: c.type,
    tags: c.tags || [],
  };
}

export function useCardExport({ srSettings }: UseCardExportDeps) {
  const exportTemplate = useCallback(
    async (compress: boolean, onProgress: ProgressFn) => {
      const dateStr = new Date().toISOString().slice(0, 10);

      onProgress(5, "Priprema templatea…");
      // Read from SQLite backup-readers.
      const [catRecords, allCards] = await Promise.all([
        readAllCategoriesForBackup(),
        readAllCardsForBackup(),
      ]);
      const sortedCats = [...catRecords].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );

      const cardSource: Card[] = allCards;

      const blob = await streamBackup({
        version: 2,
        type: "template",
        scalars: {
          categories: sortedCats,
          subcategories: deriveSubMap(sortedCats),
        },
        sources: [
          sourceSpec("cards", async () => cardSource.map(projectCardToTemplate)),
        ],
        onProgress,
        pStart: 10,
        pEnd: 85,
      });

      try {
        if (compress) {
          onProgress(85, "Kompresija…");
          const { compressToZip } = await import("@/lib/zip-service");
          const zipBlob = await compressToZip(`codex-template-${dateStr}.json`, blob);
          onProgress(100, "Preuzimanje…");
          const r = await downloadFile(zipBlob, `codex-template-${dateStr}.zip`);
          if (r.saved) toast.success("Template uspješno exportovan.");
        } else {
          onProgress(100, "Preuzimanje…");
          const r = await downloadFile(blob, `codex-template-${dateStr}.json`);
          if (r.saved) toast.success("Template uspješno exportovan.");
        }
      } catch (err) {
        toast.error("Greška pri exportu templatea", { description: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    },
    [srSettings],
  );

  const exportData = useCallback(
    async (compress: boolean, onProgress: ProgressFn) => {
      onProgress(2, "Priprema…");

      // Categories via SQLite backup-readers.
      const catRecords = await readAllCategoriesForBackup();
      const sortedCats = [...catRecords].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
      );

      const localStorageData: Record<string, unknown> = {};
      const lsKeys = [
        "sr-app-settings", "sr-mnemonic-workshop", "sr-mnemonic-associations",
        "sr-major-system-map", "sr-learn-progress", "sr-last-backup",
        "sr-dark-mode", "sr-tts-settings",
      ];
      for (const key of lsKeys) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          try { localStorageData[key] = JSON.parse(val); } catch { localStorageData[key] = val; }
        }
      }

      const dateStr = new Date().toISOString().slice(0, 10);

      const blob = await streamBackup({
        version: 7,
        type: "full",
        scalars: {
          subcategories: deriveSubMap(sortedCats),
          srSettings,
          localStorageData,
        },
        sources: [
          sourceSpec("cards", () => readAllCardsForBackup()),
          sourceSpec("categories", async () => sortedCats),
          sourceSpec("sources", () => readAllSourcesForBackup()),
          sourceSpec("mindMaps", () => readAllMindMapsForBackup()),
          sourceSpec("knowledgeBaseArticles", () => readAllKbArticlesForBackup()),
          sourceSpec("diary", () => readDiary()),
          sourceSpec("calibrationLog", () => readCalibrationLog()),
          sourceSpec("latencyLog", () => readLatencyLog()),
          sourceSpec("slippageLog", () => readSlippageLog()),
          sourceSpec("activityLog", () => readActivityLog()),
          sourceSpec("disciplineLog", () => readAllDisciplineLogForBackup()),
          sourceSpec("pomodoroLog", () => readPomodoroLog()),
          sourceSpec("reviewLog", () => readReviewLog()),
          sourceSpec("mnemonics", () => readAllMnemonicsForBackup()),
          sourceSpec("majorSystem", () => readAllMajorSystemForBackup()),
          sourceSpec("mnemonicTestLog", () => readAllMnemonicTestLogForBackup()),
          sourceSpec("settings", () => readSettingsTableRaw()),
        ],
        onProgress,
        pStart: 5,
        pEnd: 80,
      });

      try {
        let saved = false;
        if (compress) {
          onProgress(85, "Kompresija…");
          const { compressToZip } = await import("@/lib/zip-service");
          const zipBlob = await compressToZip(`codex-backup-${dateStr}.json`, blob);
          onProgress(100, "Preuzimanje…");
          const r = await downloadFile(zipBlob, `codex-backup-${dateStr}.zip`);
          saved = r.saved;
        } else {
          onProgress(100, "Preuzimanje…");
          const r = await downloadFile(blob, `codex-backup-${dateStr}.json`);
          saved = r.saved;
        }
        if (saved) {
          toast.success("Kompletni backup uspješno exportovan.");
          setLastBackupTime();
        }
      } catch (err) {
        toast.error("Greška pri exportu backupa", { description: err instanceof Error ? err.message : String(err) });
        throw err;
      }
    },
    [srSettings],
  );

  return { exportData, exportTemplate };
}
