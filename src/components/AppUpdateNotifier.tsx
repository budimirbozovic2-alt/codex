import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/components/ui/sonner";
import type { AppUpdateEvent } from "@/types/electron-api";

/**
 * Global listener for electron-updater events.
 * Shows a toast when the startup check finds a new version (not on manual checks from Settings).
 */
export default function AppUpdateNotifier() {
  const navigate = useNavigate();
  const notifiedRef = useRef(new Set<string>());

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onAppUpdateEvent) return;

    const mark = (key: string) => {
      if (notifiedRef.current.has(key)) return false;
      notifiedRef.current.add(key);
      return true;
    };

    return api.onAppUpdateEvent((ev: AppUpdateEvent) => {
      if (ev.type === "available" && ev.source === "startup") {
        if (!mark(`available:${ev.version}`)) return;
        toast("Dostupna je nova verzija", {
          description: `CODEX v${ev.version} je spreman za preuzimanje.`,
          duration: 12_000,
          action: {
            label: "Preuzmi",
            onClick: () => {
              void api.downloadUpdate?.().then((res) => {
                if (res && !res.ok) {
                  toast.error(res.error ?? "Preuzimanje nije uspjelo.");
                }
              });
            },
          },
          cancel: {
            label: "Podešavanja",
            onClick: () => navigate("/settings/data"),
          },
        });
      }

      if (ev.type === "downloaded") {
        if (!mark(`downloaded:${ev.version}`)) return;
        toast.success("Ažuriranje preuzeto", {
          description: `v${ev.version} — restartujte aplikaciju da instalirate.`,
          duration: Infinity,
          action: {
            label: "Instaliraj",
            onClick: () => void api.installUpdate?.(),
          },
        });
      }
    });
  }, [navigate]);

  return null;
}
