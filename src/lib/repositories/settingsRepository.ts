// A1c-4 F2 — Settings repository facade. SQLite-primary via the kv table.
import { getSetting, putSetting } from "@/lib/db/queries";

export const settingsRepository = {
  async load<T>(key: string, fallback: T): Promise<T> {
    const v = await getSetting<T>(key);
    return v === undefined ? fallback : v;
  },
  async save(key: string, value: unknown): Promise<void> {
    await putSetting(key, value);
  },
};
