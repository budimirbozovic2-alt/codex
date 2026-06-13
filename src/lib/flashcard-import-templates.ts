/**
 * Named templates for the P:/O: flashcard mass-import textarea.
 *
 * Stored in `localStorage` (global, not category-scoped) so a user can
 * reuse the same boilerplate across subjects. Pure module — no React.
 */
const STORAGE_KEY = "memoria.flashcardImportTemplates.v1";
const MAX_TEMPLATES = 20;
const MAX_BODY_BYTES = 256 * 1024; // 256 KB safety cap

export interface FlashcardImportTemplate {
  id: string;        // uuid
  name: string;      // user-visible
  body: string;      // raw P:/O: text
  updatedAt: number; // epoch ms
}

function safeRead(): FlashcardImportTemplate[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is FlashcardImportTemplate =>
        !!t &&
        typeof (t as FlashcardImportTemplate).id === "string" &&
        typeof (t as FlashcardImportTemplate).name === "string" &&
        typeof (t as FlashcardImportTemplate).body === "string" &&
        typeof (t as FlashcardImportTemplate).updatedAt === "number",
    );
  } catch {
    return [];
  }
}

function safeWrite(list: FlashcardImportTemplate[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* quota or serialization failure — silently ignore */
  }
}

export function listTemplates(): FlashcardImportTemplate[] {
  return safeRead().sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Upserts by trimmed name (case-insensitive). Returns the saved record, or
 * `null` if validation fails (empty name/body or oversize body).
 */
export function saveTemplate(name: string, body: string): FlashcardImportTemplate | null {
  const trimmedName = name.trim();
  const trimmedBody = body.trim();
  if (!trimmedName || !trimmedBody) return null;
  if (trimmedBody.length > MAX_BODY_BYTES) return null;

  const list = safeRead();
  const lcName = trimmedName.toLowerCase();
  const existingIdx = list.findIndex(t => t.name.trim().toLowerCase() === lcName);

  const now = Date.now();
  const id =
    existingIdx >= 0
      ? list[existingIdx].id
      : (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tpl_${now}_${Math.random().toString(36).slice(2, 8)}`);

  const record: FlashcardImportTemplate = { id, name: trimmedName, body: trimmedBody, updatedAt: now };

  if (existingIdx >= 0) list[existingIdx] = record;
  else list.unshift(record);

  // Cap to MAX_TEMPLATES (oldest first dropped).
  const capped = list
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_TEMPLATES);

  safeWrite(capped);
  return record;
}

export function deleteTemplate(id: string): void {
  safeWrite(safeRead().filter(t => t.id !== id));
}
