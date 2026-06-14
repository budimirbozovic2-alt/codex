import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorV4 } from "@/components/editor-v4/EditorV4";
import type { EditorV4Handle } from "@/components/editor-v4/EditorV4";
import { type EditorDoc, type Editor } from "@/lib/editor-v4";
import { buildSourceFromDoc } from "@/lib/services/sourceEditingService";
import { useSourceMutations } from "@/hooks/source/useSourceMutations";
import { taskScheduler } from "@/lib/scheduler";
import { usePersistedDraftMirror } from "@/hooks/usePersistedDraftMirror";
import type { Source } from "@/domains/sources/sources-storage";
import { cn } from "@/lib/utils";
import type { SourceOutlineEntry } from "@/lib/source-reader/heading-navigation";
import {
  extractOutlineFromDoc,
  syncHeadingDomIds,
} from "@/lib/source-reader/heading-navigation";

interface Props {
  source: Source;
  editMode: boolean;
  onSourceUpdated?: (s: Source) => void;
  /** Live outline for the sidebar (derived from editor AST, not debounced save). */
  onOutlineChange?: (outline: SourceOutlineEntry[]) => void;
  /** Receives the TipTap editor instance so the parent can mount BubbleMenu. */
  onEditorReady: (editor: Editor | null) => void;
}

/**
 * In-place source viewer/editor backed by `<EditorV4>`.
 *
 * - `contentDoc` (AST) is the sole SSOT for the body — legacy HTML field is gone.
 * - When `editMode === false`, the editor is read-only but TipTap still tracks
 *   selection so the parent `<SourceBubbleMenu>` keeps working.
 * - Autosave: 1s debounce via `taskScheduler`; drafts mirrored to SQLite.
 * - PR-7f M3d: persistence goes through `useSourceMutations().save` so the
 *   read cache flips optimistically and any error rolls back the AST too.
 */
const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

export function SourceContent({ source, editMode, onSourceUpdated, onOutlineChange, onEditorReady }: Props) {
  const initialDoc = useMemo<EditorDoc>(
    () => source.contentDoc ?? EMPTY_DOC,
    // Re-compute when underlying source identity flips; updates within the
    // same source come through the editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source.id],
  );

  const editorRef = useRef<EditorV4Handle>(null);
  const draftJsonRef = useRef<string>(JSON.stringify(initialDoc));
  const baselineJsonRef = useRef<string>(JSON.stringify(initialDoc));
  const [draftRevision, setDraftRevision] = useState(0);
  const { save: saveMutation } = useSourceMutations();

  // Debounced autosave — synchronous mutation snapshot, async persist.
  const persistDebounced = useMemo(
    () => taskScheduler.debounce(
      async (doc: EditorDoc) => {
        const next = buildSourceFromDoc(source, doc);
        await saveMutation.mutateAsync(next);
        onSourceUpdated?.(next);
      },
      1000,
      { label: `sourceContent:${source.id}`, pauseWhenHidden: false },
    ),
    [source, onSourceUpdated, saveMutation],
  );

  useEffect(() => () => { persistDebounced.cancel(); }, [persistDebounced]);

  useEffect(() => {
    onOutlineChange?.(extractOutlineFromDoc(initialDoc));
  }, [initialDoc, onOutlineChange]);

  const handleChange = useCallback((doc: EditorDoc) => {
    draftJsonRef.current = JSON.stringify(doc);
    setDraftRevision((n) => n + 1);
    onOutlineChange?.(extractOutlineFromDoc(doc));
    persistDebounced(doc);
  }, [persistDebounced, onOutlineChange]);

  const draftDirty = draftJsonRef.current !== baselineJsonRef.current;

  usePersistedDraftMirror({
    key: `source:${source.id}`,
    source: "source-html",
    enabled: draftDirty,
    payload: draftJsonRef.current,
  });

  // Sync heading ids + link icons after each editor revision.
  useEffect(() => {
    const root = document.querySelector(".source-content-host .ProseMirror");
    if (!root) return;
    syncHeadingDomIds(root);
    root.querySelectorAll<HTMLElement>("h1, h2, h3, h4").forEach(h => {
      if (h.querySelector(".heading-link-icon")) return;
      const icon = document.createElement("span");
      icon.className = "heading-link-icon";
      icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
      h.appendChild(icon);
    });
  }, [draftRevision]);

  return (
    <div className={cn(
      "source-content-host space-y-2",
      // Prose styling lives on the ProseMirror root.
    )}>
      <EditorV4
        ref={editorRef}
        initialDoc={initialDoc}
        editable={editMode}
        hideToolbar
        onChange={handleChange}
        onEditorReady={onEditorReady}
        categoryId={source.categoryId}
        embedKind="source"
        className={cn(
          "rounded-lg border bg-card p-6 prose prose-sm max-w-none",
          "prose-headings:text-foreground prose-headings:cursor-pointer prose-headings:hover:text-primary prose-headings:transition-colors prose-headings:scroll-mt-24",
          "prose-p:text-foreground prose-strong:text-foreground prose-a:text-primary",
          "prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground",
          "[&_h1]:relative [&_h1]:group [&_h2]:relative [&_h2]:group [&_h3]:relative [&_h3]:group [&_h4]:relative [&_h4]:group",
          "[&_.heading-link-icon]:inline-flex [&_.heading-link-icon]:items-center [&_.heading-link-icon]:ml-2",
          "[&_.heading-link-icon]:text-muted-foreground/40 [&_.heading-link-icon]:opacity-0",
          "[&_h1:hover_.heading-link-icon]:opacity-100 [&_h2:hover_.heading-link-icon]:opacity-100 [&_h3:hover_.heading-link-icon]:opacity-100",
          "[&_.heading-link-icon]:transition-opacity [&_.heading-link-icon]:duration-200",
          editMode && "ring-1 ring-primary/30",
        )}
      />
    </div>
  );
}


