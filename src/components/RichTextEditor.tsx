import { useRef, useCallback, useEffect } from "react";
import { Bold, Paintbrush } from "lucide-react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalValue = useRef(value);
  const isComposing = useRef(false);

  // Only sync from outside when value changes externally (not from our own edits)
  useEffect(() => {
    if (editorRef.current && value !== internalValue.current) {
      internalValue.current = value;
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const execCommand = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      internalValue.current = editorRef.current.innerHTML;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleBold = () => {
    editorRef.current?.focus();
    execCommand("bold");
  };

  const handleRed = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const parentEl = selection.anchorNode?.parentElement;
    const isRed = parentEl?.style.color === "red" || parentEl?.classList.contains("text-red");

    if (isRed && parentEl && parentEl !== editorRef.current) {
      const text = document.createTextNode(parentEl.textContent || "");
      parentEl.replaceWith(text);
      if (editorRef.current) {
        internalValue.current = editorRef.current.innerHTML;
        onChange(editorRef.current.innerHTML);
      }
    } else {
      editorRef.current?.focus();
      execCommand("foreColor", "#ef4444");
    }
  };

  const handleInput = () => {
    if (isComposing.current) return;
    if (editorRef.current) {
      internalValue.current = editorRef.current.innerHTML;
      onChange(editorRef.current.innerHTML);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const isEmpty = !value || value === "<br>" || value.replace(/<[^>]*>/g, "").trim() === "";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1 px-1">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleBold}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Bolduj (Ctrl+B)"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleRed}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors"
          title="Crvena boja"
        >
          <Paintbrush className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onPaste={handlePaste}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
          dangerouslySetInnerHTML={{ __html: value }}
          suppressContentEditableWarning
          className="min-h-[100px] resize-y overflow-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {isEmpty && (
          <span className="absolute top-2 left-3 text-sm text-muted-foreground pointer-events-none">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  );
}
