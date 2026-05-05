import { useCallback } from "react";
import { toast } from "sonner";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { setLastBackupTime } from "@/lib/storage";
import type { CategoryRecord } from "@/lib/db-schema";
import { streamBackup, type ProgressFn } from "@/lib/backup/export-stream";

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
  cards: Card[];
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

export function useCardExport({ cards, srSettings }: UseCardExportDeps) {
  const exportTemplate = useCallback(
    async (compress: boolean, onProgress: ProgressFn) => {
      const { db } = await import("@/lib/db");

      const dateStr = new Date().toISOString().slice(0, 10);

      // Templates don't carry logs; stream cards but project to template shape.
      // Wrapped in a single read-only transaction so categories + cards form
      // a consistent point-in-time snapshot even if the user is actively
      // editing in another tab/process.
      onProgress(5, "Priprema templatea…");
      const parts: BlobPart[] = [];
      let i = 0;
      await db.transaction("r", [db.categories, db.cards], async () => {
        const catRecords = await db.categories.orderBy("sortOrder").toArray();
        parts.push(`{"version":2,"type":"template"`);
        parts.push(`,"categories":${JSON.stringify(catRecords)}`);
        parts.push(`,"subcategories":${JSON.stringify(deriveSubMap(catRecords))}`);
        parts.push(`,"cards":[`);
        const total = await db.cards.count();
        await db.cards.each((c) => {
          const t = {
            id: c.id,
            question: c.question,
            sections: c.sections.map((s) => ({ title: s.title, content: s.content })),
            categoryId: c.categoryId,
            subcategoryId: c.subcategoryId || "",
            chapterId: c.chapterId || "",
            type: c.type,
            tags: c.tags || [],
          };
          parts.push((i === 0 ? "" : ",") + JSON.stringify(t));
          i++;
          if (i % 500 === 0) {
            onProgress(10 + Math.round((i / Math.max(total, 1)) * 70), `Kartice ${i}/${total}`);
          }
        });
      });
      // Fall back to in-memory if IDB empty
      if (i === 0 && cards.length > 0) {
        parts.push(cards.map((c) => JSON.stringify({
          id: c.id, question: c.question,
          sections: c.sections.map((s) => ({ title: s.title, content: s.content })),
          categoryId: c.categoryId, subcategoryId: c.subcategoryId || "",
          chapterId: c.chapterId || "", type: c.type, tags: c.tags || [],
        })).join(","));
      }
      parts.push("]}");
      const blob = new Blob(parts, { type: "application/json" });

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
    [cards],
  );

  const exportData = useCallback(
    async (compress: boolean, onProgress: ProgressFn) => {
      onProgress(2, "Priprema…");
      const { db } = await import("@/lib/db");

      // Pre-compute scalars that need to be embedded inline (small objects),
      // and read the ordered category list once for `subcategories` map.
      // The categories table is also streamed below for the array form, so
      // this single sync read is cheap.
      const catRecords = await db.categories.orderBy("sortOrder").toArray();

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
          subcategories: deriveSubMap(catRecords),
          srSettings,
          localStorageData,
        },
        tables: [
          { key: "cards", table: db.cards as unknown as import("dexie").Table<unknown, unknown> },
          { key: "categories", table: db.categories as unknown as import("dexie").Table<unknown, unknown>,
            collection: () => db.categories.orderBy("sortOrder") as unknown as { each: (cb: (r: unknown) => unknown) => Promise<unknown> } },
          { key: "sources", table: db.sources as unknown as import("dexie").Table<unknown, unknown> },
          { key: "mindMaps", table: db.mindMaps as unknown as import("dexie").Table<unknown, unknown> },
          { key: "knowledgeBaseArticles", table: db.knowledgeBaseArticles as unknown as import("dexie").Table<unknown, unknown> },
          { key: "diary", table: db.diary as unknown as import("dexie").Table<unknown, unknown> },
          { key: "calibrationLog", table: db.calibrationLog as unknown as import("dexie").Table<unknown, unknown> },
          { key: "latencyLog", table: db.latencyLog as unknown as import("dexie").Table<unknown, unknown> },
          { key: "slippageLog", table: db.slippageLog as unknown as import("dexie").Table<unknown, unknown> },
          { key: "activityLog", table: db.activityLog as unknown as import("dexie").Table<unknown, unknown> },
          { key: "disciplineLog", table: db.disciplineLog as unknown as import("dexie").Table<unknown, unknown> },
          { key: "pomodoroLog", table: db.pomodoroLog as unknown as import("dexie").Table<unknown, unknown> },
          { key: "reviewLog", table: db.reviewLog as unknown as import("dexie").Table<unknown, unknown> },
          { key: "mnemonics", table: db.mnemonics as unknown as import("dexie").Table<unknown, unknown> },
          { key: "majorSystem", table: db.majorSystem as unknown as import("dexie").Table<unknown, unknown> },
          { key: "mnemonicTestLog", table: db.mnemonicTestLog as unknown as import("dexie").Table<unknown, unknown> },
          { key: "settings", table: db.settings as unknown as import("dexie").Table<unknown, unknown> },
        ],
        txTables: [
          db.cards, db.categories, db.sources, db.mindMaps, db.knowledgeBaseArticles,
          db.diary, db.calibrationLog, db.latencyLog, db.slippageLog,
          db.activityLog, db.disciplineLog, db.pomodoroLog, db.reviewLog,
          db.mnemonics, db.majorSystem, db.mnemonicTestLog, db.settings,
        ] as unknown as import("dexie").Table<unknown, unknown>[],
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
    [cards, srSettings],
  );

  return { exportData, exportTemplate };
}
