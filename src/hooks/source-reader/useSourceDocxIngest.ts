/**
 * useSourceDocxIngest — owns DOCX upload state + drag/drop wiring.
 *
 * Extracted from `SourceEditor.tsx` (R1): the component is no longer
 * responsible for the worker call, file validation, toast surface, or
 * the dropzone refs. It just renders the dropzone and reacts to
 * `onParsed(doc)` to fold the new AST into the editor.
 */
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { parseDocxInWorker } from "@/features/docx-importer";
import { htmlToDoc, type EditorDoc } from "@/lib/editor-v4";

export interface UseSourceDocxIngestOptions {
  /** Called when a .docx file has been parsed into a V4 AST. */
  onParsed: (doc: EditorDoc) => void;
}

export interface UseSourceDocxIngestApi {
  docxParsing: boolean;
  docxFileName: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  dropZoneRef: React.RefObject<HTMLDivElement>;
  handleDocxFile: (file: File) => Promise<void>;
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
}

export function useSourceDocxIngest({ onParsed }: UseSourceDocxIngestOptions): UseSourceDocxIngestApi {
  const [docxParsing, setDocxParsing] = useState(false);
  const [docxFileName, setDocxFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const handleDocxFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".docx")) {
      toast.error("Pogrešan format", { description: "Podržani su samo .docx fajlovi." });
      return;
    }
    setDocxParsing(true);
    setDocxFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const html = await parseDocxInWorker(arrayBuffer);
      onParsed(htmlToDoc(html));
      toast.success("DOCX učitan", { description: `${file.name} uspješno parsiran.` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Neuspješno čitanje DOCX fajla.";
      toast.error("Greška pri parsiranju", { description: message });
    } finally {
      setDocxParsing(false);
    }
  }, [onParsed]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) void handleDocxFile(file);
  }, [handleDocxFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    docxParsing,
    docxFileName,
    fileInputRef,
    dropZoneRef,
    handleDocxFile,
    handleDrop,
    handleDragOver,
  };
}
