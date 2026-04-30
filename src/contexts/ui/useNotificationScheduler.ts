import { useEffect } from "react";
import { loadAppSettings } from "@/lib/app-settings";

export function useNotificationScheduler() {
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    let lastSentDate = "";
    const cachedNotif = loadAppSettings().notifications;
    const settingsRef = { enabled: cachedNotif.enabled, hour: cachedNotif.reminderHour, minute: cachedNotif.reminderMinute };

    const refreshSettings = () => {
      const s = loadAppSettings().notifications;
      settingsRef.enabled = s.enabled;
      settingsRef.hour = s.reminderHour;
      settingsRef.minute = s.reminderMinute;
    };

    const check = () => {
      if (!settingsRef.enabled) return;
      const now = new Date();
      const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
      if (now.getHours() === settingsRef.hour && now.getMinutes() === settingsRef.minute) {
        if (lastSentDate === todayKey) return;
        lastSentDate = todayKey;
        new Notification("CODEX — Podsjetnik", {
          body: "Vrijeme je za ponavljanje! Imaš kartice koje čekaju.",
          icon: `${import.meta.env.BASE_URL}placeholder.svg`,
        });
      }
    };

    const onVisChange = () => { if (document.visibilityState === "visible") refreshSettings(); };
    document.addEventListener("visibilitychange", onVisChange);
    const interval = window.setInterval(check, 60000);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisChange); };
  }, []);
}
