import { useCallback, useEffect, useState } from "react";
import type { AppUpdateEvent } from "@/types/electron-api";

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "ready"
  | "error";

export function useAppUpdater() {
  const api = window.electronAPI;
  const supported = !!api?.checkForUpdates;

  const [currentVersion, setCurrentVersion] = useState(__APP_VERSION__);
  const [status, setStatus] = useState<AppUpdateStatus>("idle");
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api?.getAppVersion?.().then(setCurrentVersion).catch(() => {});
  }, [api]);

  useEffect(() => {
    if (!api?.onAppUpdateEvent) return;
    const handleEvent = (ev: AppUpdateEvent) => {
      switch (ev.type) {
        case "available":
          setStatus("available");
          setRemoteVersion(ev.version);
          setError(null);
          break;
        case "not-available":
          setStatus("not-available");
          setRemoteVersion(ev.version);
          setError(null);
          break;
        case "progress":
          setStatus("downloading");
          setProgress(Math.round(ev.percent));
          break;
        case "downloaded":
          setStatus("ready");
          setRemoteVersion(ev.version);
          setProgress(100);
          break;
        case "error":
          setStatus("error");
          setError(ev.message);
          break;
      }
    };
    return api.onAppUpdateEvent(handleEvent);
  }, [api]);

  const check = useCallback(async () => {
    if (!api?.checkForUpdates) return;
    setStatus("checking");
    setError(null);
    setProgress(0);
    const result = await api.checkForUpdates();
    if (!result.ok) {
      setStatus("error");
      setError(result.error ?? "Provjera ažuriranja nije uspjela.");
      return;
    }
    if (result.hasUpdate && result.version) {
      setStatus("available");
      setRemoteVersion(result.version);
    } else {
      setStatus("not-available");
      if (result.version) setRemoteVersion(result.version);
    }
  }, [api]);

  const download = useCallback(async () => {
    if (!api?.downloadUpdate) return;
    setStatus("downloading");
    setError(null);
    const result = await api.downloadUpdate();
    if (!result.ok) {
      setStatus("error");
      setError(result.error ?? "Preuzimanje nije uspjelo.");
    }
  }, [api]);

  const install = useCallback(async () => {
    if (!api?.installUpdate) return;
    await api.installUpdate();
  }, [api]);

  return {
    supported,
    currentVersion,
    remoteVersion,
    status,
    progress,
    error,
    check,
    download,
    install,
  };
}
