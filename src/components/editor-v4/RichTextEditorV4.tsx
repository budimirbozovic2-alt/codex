/**
 * PR-7c (M2): drop-in replacement for the legacy `<RichTextEditor>` HTML-string
 * surface. Keeps the same `(value, onChange, placeholder, minimal)` contract
 * for the three remaining smart-split / mnemonic consumers that still persist
 * HTML strings, but routes all editing through the canonical `<EditorV4>`
 * (TipTap V4 schema, no `document.execCommand`, no `window.getSelection`).
 *
 * Long-term those callers should hold `contentDoc` directly; this wrapper is
 * the deletion seam, not the destination.
 */
import { useMemo } from "react";
import { EditorV4 } from "./EditorV4";
import { htmlToDoc } from "@/lib/editor-v4";
import { deriveHtml } from "@/lib/editor-v4/derived";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minimal?: boolean;
  className?: string;
}

export default function RichTextEditorV4({ value, onChange, placeholder, minimal, className }: Props) {
  // Seed once per mount. `<EditorV4>` is uncontrolled — value changes from the
  // parent during a typing session are ignored on purpose (caller is the
  // source of truth via `onChange`).
  const initialDoc = useMemo(
    () => htmlToDoc(value ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <EditorV4
      initialDoc={initialDoc}
      onChange={(doc) => onChange(deriveHtml(doc))}
      placeholder={placeholder}
      minimal={minimal}
      className={className}
    />
  );
}
