import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { EditorV4 } from "@/components/editor-v4/EditorV4";
import type { EditorV4Handle } from "@/components/editor-v4/EditorV4";
import { type EditorDoc, type Editor } from "@/lib/editor-v4";
import { buildSourceFromDoc } from "@/lib/services/sourceEditingService";
import { useSourceMutations } from "@/hooks/source/useSourceMutations";
import { taskScheduler } from "@/lib/scheduler";
import { usePersistedDraftMirror } from "@/hooks/usePersistedDraftMirror";
import { getDraft, deleteDraft } from "@/lib/drafts";
import type { Source } from "@/domains/sources/sources-storage";
import { cn } from "@/lib/utils";
import type { SourceOutlineEntry } from "@/lib/source-reader/heading-navigation";
import {
  extractOutlineFromDoc,
  syncHeadingDomIds,
} from "@/lib/source-reader/heading-navigation";
import { useSourceContentSaveStore } from "@/store/useSourceContentSaveStore";
import {
  useSourceReaderStore,
  READER_FONT_SIZE_CLASS,
  READER_LINE_HEIGHT_VALUE,
} from "@/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Props {
  source: Source;
  editMode: boolean;
  onSourceUpdated?: (s: Source) => void;
  onOutlineChange?: (outline: SourceOutlineEntry[]) => void;
  onEditorReady: (editor: Editor | null) => void;
}

const EMPTY_DOC: EditorDoc = { version: 4, content: { type: "doc", content: [] } };

function isDocEmpty(doc: EditorDoc): boolean {
  const content = doc.content?.content;
  return !content || content.length === 0;
}

function parseDraftPayload(payload: unknown): EditorDoc | null {
  try {
    const raw = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (raw && typeof raw === "object" && (raw as EditorDoc).version === 4 && (raw as EditorDoc).content) {
      return raw as EditorDoc;
    }
  } catch {
    return null;
  }
  return null;
}

export function SourceContent({ source, editMode, onSourceUpdated, onOutlineChange, onEditorReady }: Props) {
  const initialDoc = useMemo<EditorDoc>(
    () => source.contentDoc ?? EMPTY_DOC,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source.id],
  );

  const readerFontSize = useSourceReaderStore(s => s.readerFontSize);
  const readerLineHeight = useSourceReaderStore(s => s.readerLineHeight);

  const editorRef = useRef<EditorV4Handle>(null);
  const draftJsonRef = useRef<string>(JSON.stringify(initialDoc));
  const baselineJsonRef = useRef<string>(JSON.stringify(initialDoc));
  const [draftRevision, setDraftRevision] = useState(0);
  const [displayDoc, setDisplayDoc] = useState<EditorDoc>(initialDoc);
  const [pendingRecovery, setPendingRecovery] = useState<EditorDoc | null>(null);
  const { save: saveMutation } = useSourceMutations();
  const setSaveStatus = useSourceContentSaveStore((s) => s.setStatus);
  const setSaveDirty = useSourceContentSaveStore((s) => s.setDirty);
  const resetSaveStore = useSourceContentSaveStore((s) => s.reset);
  const savedFadeTimerRef = useRef<ReturnType<typeof taskScheduler.setTimeout> | null>(null);

  useEffect(() => {
    const json = JSON.stringify(initialDoc);
    draftJsonRef.current = json;
    baselineJsonRef.current = json;
    setDisplayDoc(initialDoc);
    setDraftRevision(0);
    setPendingRecovery(null);
    resetSaveStore();
  }, [source.id, initialDoc, resetSaveStore]);

  useEffect(() => {
    let cancelled = false;
    void getDraft(`source:${source.id}`).then((row) => {
      if (cancelled || !row || row.source !== "source-html") return;
      const recovered = parseDraftPayload(row.payload);
      if (!recovered) return;
      const recoveredJson = JSON.stringify(recovered);
      if (recoveredJson !== baselineJsonRef.current) {
        setPendingRecovery(recovered);
      }
    });
    return () => { cancelled = true; };
  }, [source.id]);

  useEffect(() => () => {
    if (savedFadeTimerRef.current !== null) {
      taskScheduler.cancel(savedFadeTimerRef.current);
    }
    resetSaveStore();
  }, [resetSaveStore]);

  const persistDebounced = useMemo(
    () => taskScheduler.debounce(
      async (doc: EditorDoc) => {
        setSaveStatus("saving");
        const next = buildSourceFromDoc(source, doc);
        try {
          await saveMutation.mutateAsync(next);
          baselineJsonRef.current = JSON.stringify(doc);
          setSaveDirty(false);
          setSaveStatus("saved");
          onSourceUpdated?.(next);
          if (savedFadeTimerRef.current !== null) taskScheduler.cancel(savedFadeTimerRef.current);
          savedFadeTimerRef.current = taskScheduler.setTimeout(
            () => setSaveStatus("idle"),
            2000,
            { label: "sourceContent:savedFade" },
          );
        } catch {
          setSaveStatus("error");
          toast.error("Čuvanje izvora nije uspjelo", {
            description: "Pokušajte ponovo ili sačuvajte ručno prije napuštanja.",
          });
        }
      },
      1000,
      { label: `sourceContent:${source.id}`, pauseWhenHidden: false },
    ),
    [source, onSourceUpdated, saveMutation, setSaveDirty, setSaveStatus],
  );

  useEffect(() => () => { persistDebounced.cancel(); }, [persistDebounced]);

  useEffect(() => {
    onOutlineChange?.(extractOutlineFromDoc(displayDoc));
  }, [displayDoc, onOutlineChange]);

  const applyDoc = useCallback((doc: EditorDoc) => {
    draftJsonRef.current = JSON.stringify(doc);
    setDraftRevision((n) => n + 1);
    setDisplayDoc(doc);
    const dirty = draftJsonRef.current !== baselineJsonRef.current;
    setSaveDirty(dirty);
    if (dirty) {
      setSaveStatus("dirty");
      persistDebounced(doc);
    }
    onOutlineChange?.(extractOutlineFromDoc(doc));
    const editor = editorRef.current?.getEditor();
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(doc.content)) {
      editor.commands.setContent(doc.content, { emitUpdate: false });
    }
  }, [onOutlineChange, persistDebounced, setSaveDirty, setSaveStatus]);

  const handleChange = useCallback((doc: EditorDoc) => {
    applyDoc(doc);
  }, [applyDoc]);

  const handleRestoreDraft = useCallback(() => {
    if (!pendingRecovery) return;
    applyDoc(pendingRecovery);
    setPendingRecovery(null);
    toast.success("Nesačuvane izmjene učitane");
  }, [applyDoc, pendingRecovery]);

  const handleDismissDraft = useCallback(() => {
    void deleteDraft(`source:${source.id}`);
    setPendingRecovery(null);
  }, [source.id]);

  const draftDirty = draftJsonRef.current !== baselineJsonRef.current;

  usePersistedDraftMirror({
    key: `source:${source.id}`,
    source: "source-html",
    enabled: draftDirty,
    payload: draftJsonRef.current,
  });

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

  const showEmptyPlaceholder = isDocEmpty(displayDoc) && !editMode;

  return (
    <div
      className={cn("source-content-host space-y-2 relative")}
      style={{ lineHeight: READER_LINE_HEIGHT_VALUE[readerLineHeight] }}
    >
      {pendingRecovery && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3">
          <p className="text-sm text-foreground">
            Pronađene su nesačuvane izmjene ovog izvora. Želite li nastaviti gdje ste stali?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="default" className="gap-1.5" onClick={handleRestoreDraft}>
              <RotateCcw className="h-3.5 w-3.5" />
              Nastavi
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={handleDismissDraft}>
              <X className="h-3.5 w-3.5" />
              Odbaci
            </Button>
          </div>
        </div>
      )}

      {showEmptyPlaceholder && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <p className="text-sm text-muted-foreground text-center px-6">
            Dokument je prazan. Uključite režim uređivanja i dodajte sadržaj ili uvezite DOCX.
          </p>
        </div>
      )}

      <EditorV4
        ref={editorRef}
        initialDoc={displayDoc}
        editable={editMode}
        hideToolbar
        onChange={handleChange}
        onEditorReady={onEditorReady}
        categoryId={source.categoryId}
        embedKind="source"
        className={cn(
          "rounded-lg border bg-card p-6 prose max-w-none",
          READER_FONT_SIZE_CLASS[readerFontSize],
          "prose-headings:text-foreground prose-headings:cursor-pointer prose-headings:hover:text-primary prose-headings:transition-colors prose-headings:scroll-mt-24",
          "prose-p:text-foreground prose-strong:text-foreground prose-a:text-primary",
          "prose-ul:text-foreground prose-ol:text-foreground prose-li:text-foreground",
          "[&_h1]:relative [&_h1]:group [&_h2]:relative [&_h2]:group [&_h3]:relative [&_h3]:group [&_h4]:relative [&_h4]:group",
          "[&_.heading-link-icon]:inline-flex [&_.heading-link-icon]:items-center [&_.heading-link-icon]:ml-2",
          "[&_.heading-link-icon]:text-muted-foreground/40 [&_.heading-link-icon]:opacity-0",
          "[&_h1:hover_.heading-link-icon]:opacity-100 [&_h2:hover_.heading-link-icon]:opacity-100 [&_h3:hover_.heading-link-icon]:opacity-100",
          "[&_.heading-link-icon]:transition-opacity [&_.heading-link-icon]:duration-200",
          editMode && "ring-1 ring-primary/30",
          showEmptyPlaceholder && "min-h-[240px]",
        )}
      />
    </div>
  );
}
