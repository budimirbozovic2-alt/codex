import { useEffect, useMemo, useState } from "react";
import type { ExaminerProfile, ExaminerDifficulty, PreferredAnswerType } from "@/lib/db-types";
import {
  EXAMINER_CHECKLIST_MAX_ITEMS,
  normalizeChecklistItem,
  normalizeChecklistItems,
} from "@/lib/examiner-profile-presets";

export const NONE = "__none__";
export const NOTES_MAX = 500;

function checklistEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item === b[i]);
}

export function useExaminerProfileEditor(initialProfile?: ExaminerProfile, open = true) {
  const [difficulty, setDifficulty] = useState<string>(initialProfile?.difficulty ?? NONE);
  const [answerType, setAnswerType] = useState<string>(initialProfile?.preferredAnswerType ?? NONE);
  const [checklist, setChecklist] = useState<string[]>(
    () => normalizeChecklistItems(initialProfile?.expectedAnswerElements ?? []),
  );
  const [newItem, setNewItem] = useState("");
  const [notes, setNotes] = useState<string>(initialProfile?.notes ?? "");

  useEffect(() => {
    if (open) {
      setDifficulty(initialProfile?.difficulty ?? NONE);
      setAnswerType(initialProfile?.preferredAnswerType ?? NONE);
      setChecklist(normalizeChecklistItems(initialProfile?.expectedAnswerElements ?? []));
      setNewItem("");
      setNotes(initialProfile?.notes ?? "");
    }
  }, [open, initialProfile]);

  const initialDifficulty = initialProfile?.difficulty ?? NONE;
  const initialAnswerType = initialProfile?.preferredAnswerType ?? NONE;
  const initialChecklist = useMemo(
    () => normalizeChecklistItems(initialProfile?.expectedAnswerElements ?? []),
    [initialProfile?.expectedAnswerElements],
  );
  const initialNotes = initialProfile?.notes ?? "";

  const isDirty = useMemo(
    () =>
      difficulty !== initialDifficulty
      || answerType !== initialAnswerType
      || notes !== initialNotes
      || !checklistEqual(checklist, initialChecklist),
    [difficulty, answerType, notes, checklist, initialDifficulty, initialAnswerType, initialNotes, initialChecklist],
  );

  const buildProfile = (): ExaminerProfile => {
    const trimmed = notes.trim().slice(0, NOTES_MAX);
    const normalizedChecklist = normalizeChecklistItems(checklist);
    return {
      difficulty: difficulty === NONE ? undefined : (difficulty as ExaminerDifficulty),
      preferredAnswerType: answerType === NONE ? undefined : (answerType as PreferredAnswerType),
      expectedAnswerElements: normalizedChecklist.length > 0 ? normalizedChecklist : undefined,
      notes: trimmed || undefined,
    };
  };

  const addItem = (raw: string) => {
    const item = normalizeChecklistItem(raw);
    if (!item) return;
    setChecklist((prev) => normalizeChecklistItems([...prev, item]));
    setNewItem("");
  };

  const removeItem = (index: number) => {
    setChecklist((prev) => prev.filter((_, i) => i !== index));
  };

  const atMax = checklist.length >= EXAMINER_CHECKLIST_MAX_ITEMS;
  const checklistKeys = useMemo(() => new Set(checklist.map((c) => c.toLowerCase())), [checklist]);

  return {
    difficulty,
    setDifficulty,
    answerType,
    setAnswerType,
    checklist,
    newItem,
    setNewItem,
    notes,
    setNotes,
    isDirty,
    buildProfile,
    addItem,
    removeItem,
    atMax,
    checklistKeys,
  };
}
