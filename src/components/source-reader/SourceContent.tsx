import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorV4 } from "@/components/editor-v4/EditorV4";
import type { EditorV4Handle } from "@/components/editor-v4/EditorV4";
import { htmlToDoc, type EditorDoc, type Editor } from "@/lib/editor-v4";
import { buildSourceFromDoc } from "@/lib/services/sourceEditingService";
import { useSourceMutations } from "@/hooks/source/useSourceMutations";
import { taskScheduler } from "@/lib/scheduler";
import { usePersistedDraftMirror } from "@/hooks/usePersistedDraftMirror";
import type { Source } from "@/lib/sources-storage";
import { cn } from "@/lib/utils";

interface Props {
  source: Source;
  editMode: boolean;
  onSourceUpdated?: (s: Source) => void;
  /** Receives the TipTap editor instance so the parent can mount BubbleMenu. */
  onEditorReady: (editor: Editor | null) => void;
}

/**
 * In-place source viewer/editor backed by `<EditorV4>`.
 *
 * - `contentDoc` (AST) is SSOT — `htmlContent` is derived via `docToHtml`.
 * - When `editMode === false`, the editor is read-only but TipTap still tracks
 *   selection so the parent `<SourceBubbleMenu>` keeps working.
 * - Autosave: 1s debounce via `taskScheduler`; drafts mirrored to IDB.
 * - PR-7f M3d: persistence goes through `useSourceMutations().save` so the
 *   read cache flips optimistically and any error rolls back the AST too.
 */
export function SourceContent({ source, editMode, onSourceUpdated, onEditorReady }: Props) {
  const initialDoc = useMemo<EditorDoc>(
    () => source.contentDoc ?? htmlToDoc(source.htmlContent),
    // Re-compute when underlying source identity flips; updates within the
    // same source come through the editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source.id],
  );

  const editorRef = useRef<EditorV4Handle>(null);
  const [draftJson, setDraftJson] = useState<string>(JSON.stringify(initialDoc));
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

  const handleChange = useCallback((doc: EditorDoc) => {
    setDraftJson(JSON.stringify(doc));
    persistDebounced(doc);
  }, [persistDebounced]);

  usePersistedDraftMirror({
    key: `source:${source.id}`,
    source: "source-html",
    enabled: draftJson !== JSON.stringify(initialDoc),
    payload: draftJson,
  });

  // Post-render heading anchor enhancement (kept for navigation UX parity).
  useEffect(() => {
    const root = document.querySelector(".source-content-host .ProseMirror");
    if (!root) return;
    root.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id]").forEach(h => {
      if (h.querySelector(".heading-link-icon")) return;
      const icon = document.createElement("span");
      icon.className = "heading-link-icon";
      icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
      h.appendChild(icon);
    });
  }, [draftJson]);

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
          "prose-headings:text-foreground prose-headings:cursor-pointer prose-headings:hover:text-primary prose-headings:transition-colors",
          "prose-p:text-foreground prose-strong:text-foreground prose-a:text-primary",
          "prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground",
          "[&_h1[id]]:relative [&_h1[id]]:group [&_h2[id]]:relative [&_h2[id]]:group [&_h3[id]]:relative [&_h3[id]]:group",
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


