import { getSetting, putSetting } from "@/lib/db/queries";

const LAST_BACKUP_KEY = "sr-last-backup";

/** SQLite SSOT — boot migration lifts legacy `sr-last-backup` from localStorage. */
export async function getLastBackupTime(): Promise<number> {
  return (await getSetting<number>(LAST_BACKUP_KEY)) ?? 0;
}

export async function setLastBackupTime(): Promise<void> {
  await putSetting(LAST_BACKUP_KEY, Date.now());
}
